import { z } from "zod";
import { githubFetch } from "./backend";
import {
  reactionEmoji,
  type Channel,
  type ChatTransport,
  type Message,
  type MessageReaction,
  type ReactionContent,
} from "../../shared/chat";

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}
interface GitHubReactionGroup {
  content: ReactionContent;
  users: { totalCount: number };
  viewerHasReacted: boolean;
}
interface GitHubComment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  author: { login: string } | null;
  reactionGroups?: GitHubReactionGroup[];
  replies?: { nodes: GitHubComment[]; pageInfo: PageInfo };
}
type GitHubViewerGroups = GitHubReactionGroup[];

const pageInfoSchema = z
  .object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() })
  .refine(
    (page) => !page.hasNextPage || Boolean(page.endCursor),
    "Missing pagination cursor",
  );
const reactionContentSchema = z.enum([
  "THUMBS_UP",
  "THUMBS_DOWN",
  "LAUGH",
  "HOORAY",
  "CONFUSED",
  "HEART",
  "ROCKET",
  "EYES",
]);
const reactionGroupSchema = z.object({
  content: reactionContentSchema,
  users: z.object({ totalCount: z.number() }),
  viewerHasReacted: z.boolean(),
});
const commentSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  url: z.string(),
  author: z.object({ login: z.string() }).nullable(),
  reactionGroups: z.array(reactionGroupSchema).optional(),
});
const commentsSchema = commentSchema.extend({
  replies: z
    .object({ nodes: z.array(commentSchema), pageInfo: pageInfoSchema })
    .optional(),
});
const channelsSchema = z.object({
  repository: z
    .object({
      discussions: z.object({
        nodes: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            body: z.string(),
            url: z.string(),
            updatedAt: z.string().optional(),
          }),
        ),
        pageInfo: pageInfoSchema,
      }),
    })
    .nullable(),
});
const messagesSchema = z.object({
  node: z
    .object({
      comments: z.object({
        nodes: z.array(commentsSchema),
        pageInfo: pageInfoSchema,
      }),
    })
    .nullable(),
});
const repliesSchema = z.object({
  node: z
    .object({
      replies: z.object({
        nodes: z.array(commentSchema),
        pageInfo: pageInfoSchema,
      }),
    })
    .nullable(),
});
// Mutation payloads are namespaced under the operation field.
const reactionToggleSchema = z.object({
  addReaction: z
    .object({
      subject: z
        .object({ reactionGroups: z.array(reactionGroupSchema) })
        .nullable(),
    })
    .optional(),
  removeReaction: z
    .object({
      subject: z
        .object({ reactionGroups: z.array(reactionGroupSchema) })
        .nullable(),
    })
    .optional(),
});

function toReactions(groups: GitHubViewerGroups): MessageReaction[] {
  return groups
    .filter((group) => group.users.totalCount > 0)
    .map((group) => ({
      emoji: reactionEmoji[group.content],
      count: group.users.totalCount,
      content: group.content,
      mine: group.viewerHasReacted,
    }));
}

export const viewerSchema = z.object({ id: z.number(), login: z.string() });
export type Viewer = z.infer<typeof viewerSchema>;
const repositorySchema = z.object({
  id: z.number(),
  full_name: z.string(),
  private: z.boolean(),
  has_discussions: z.boolean().default(false),
});
export type WorkspaceRepository = z.infer<typeof repositorySchema>;

export async function githubRequest<T>(
  path: string,
  token: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(path, "https://api.github.com");
  if (url.origin !== "https://api.github.com")
    throw new GitHubError("Invalid GitHub API address.");
  const response = await githubFetch(url.pathname + url.search, token, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal,
  });
  if (!response.ok) throw responseError(response);
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success)
    throw new GitHubError("GitHub returned an unexpected response. Try again.");
  return parsed.data;
}

export async function listWorkspaceRepositories(
  token: string,
  signal?: AbortSignal,
): Promise<WorkspaceRepository[]> {
  const installations: number[] = [];
  for (let page = 1; ; page++) {
    const data = await githubRequest(
      `/user/installations?per_page=100&page=${page}`,
      token,
      z.object({
        total_count: z.number(),
        installations: z.array(z.object({ id: z.number() })),
      }),
      signal,
    );
    installations.push(
      ...data.installations.map((installation) => installation.id),
    );
    if (installations.length >= data.total_count || !data.installations.length)
      break;
  }
  const repositories = new Map<number, WorkspaceRepository>();
  for (const installation of installations) {
    let count = 0;
    for (let page = 1; ; page++) {
      const data = await githubRequest(
        `/user/installations/${installation}/repositories?per_page=100&page=${page}`,
        token,
        z.object({
          total_count: z.number(),
          repositories: z.array(repositorySchema),
        }),
        signal,
      );
      for (const repository of data.repositories)
        repositories.set(repository.id, repository);
      count += data.repositories.length;
      if (count >= data.total_count || !data.repositories.length) break;
    }
  }
  return [...repositories.values()].sort((a, b) =>
    a.full_name.localeCompare(b.full_name),
  );
}

function responseError(response: Response): GitHubError {
  if (response.status === 401)
    return new GitHubError(
      "Your GitHub session has expired. Sign in again.",
      0,
      401,
    );
  if (response.status === 403 || response.status === 429) {
    const reset =
      Number(response.headers.get("x-ratelimit-reset")) * 1000 - Date.now();
    return new GitHubError(
      "GitHub paused this request. Wait before trying again, or check repository access.",
      Math.max(
        60_000,
        (Number(response.headers.get("retry-after")) || 0) * 1000,
        Number.isFinite(reset) ? reset : 0,
      ),
      response.status,
    );
  }
  return new GitHubError(
    `GitHub could not complete this request (${response.status}).`,
    0,
    response.status,
  );
}

export class GitHubError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs = 0,
    public readonly status = 0,
  ) {
    super(message);
  }
}

export function parseRepository(repository: string): [string, string] {
  const match =
    /^(?:https:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(
      repository.trim(),
    );
  if (!match?.[1] || !match[2])
    throw new Error("Use a GitHub repository in owner/name format.");
  return [match[1], match[2]];
}

/** Direct browser transport. The caller owns credentials; this class never persists them. */
export class GitHubTransport implements ChatTransport {
  private readonly owner: string;
  private readonly repository: string;

  constructor(
    repository: string,
    private readonly token: string,
  ) {
    [this.owner, this.repository] = parseRepository(repository);
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await githubFetch("/graphql", this.token, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) {
      throw responseError(response);
    }
    const payload = z
      .object({
        data: z.unknown().optional(),
        errors: z
          .array(
            z.object({
              type: z.string().optional(),
              message: z.string(),
            }),
          )
          .optional(),
      })
      .parse(await response.json());
    if (payload.errors?.length || !payload.data) {
      const limited = payload.errors?.some(
        (error) => error.type === "RATE_LIMITED",
      );
      // Avoid reflecting arbitrary API data, including credential-bearing requests, in the UI.
      throw new GitHubError(
        limited
          ? "GitHub’s API limit was reached. Sync will retry later."
          : "GitHub could not complete this operation. Check Discussions and repository permissions.",
        limited ? 300_000 : 0,
      );
    }
    const parsed = schema.safeParse(payload.data);
    if (!parsed.success)
      throw new GitHubError(
        "GitHub returned an unexpected response. Try again.",
      );
    return parsed.data;
  }

  async listChannels(signal?: AbortSignal): Promise<Channel[]> {
    const channels: Channel[] = [];
    let after: string | null = null;
    do {
      const data: {
        repository: {
          discussions: {
            nodes: {
              id: string;
              title: string;
              body: string;
              url: string;
              updatedAt?: string;
            }[];
            pageInfo: PageInfo;
          };
        } | null;
      } = await this.graphql(
        `query Channels($owner: String!, $name: String!, $after: String) {
        repository(owner: $owner, name: $name) { discussions(first: 50, after: $after) {
          nodes { id title body url updatedAt } pageInfo { hasNextPage endCursor }
        } }
      }`,
        { owner: this.owner, name: this.repository, after },
        channelsSchema,
        signal,
      );
      if (!data.repository)
        throw new GitHubError("This workspace repository is unavailable.");
      channels.push(
        ...data.repository.discussions.nodes.map((discussion) => ({
          id: discussion.id,
          name: discussion.title.replace(/^#/, ""),
          description: discussion.body,
          url: discussion.url,
          updatedAt: discussion.updatedAt,
          activityAt: discussion.updatedAt,
        })),
      );
      const pageInfo: PageInfo = data.repository.discussions.pageInfo;
      after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
    } while (after);
    return channels;
  }

  async listMessages(
    channelId: string,
    signal?: AbortSignal,
  ): Promise<Message[]> {
    const comments: GitHubComment[] = [];
    let after: string | null = null;
    do {
      const data: {
        node: {
          comments: { nodes: GitHubComment[]; pageInfo: PageInfo };
        } | null;
      } = await this.graphql(
        `query Messages($id: ID!, $after: String) {
        node(id: $id) { ... on Discussion { comments(first: 50, after: $after) {
          nodes { id body createdAt updatedAt url author { login }
            reactionGroups { content users { totalCount } viewerHasReacted }
            replies(first: 20) { nodes { id body createdAt updatedAt url author { login }
              reactionGroups { content users { totalCount } viewerHasReacted } } pageInfo { hasNextPage endCursor } }
          } pageInfo { hasNextPage endCursor }
        } } }
      }`,
        { id: channelId, after },
        messagesSchema,
        signal,
      );
      if (!data.node)
        throw new GitHubError("This conversation is no longer available.");
      comments.push(...data.node.comments.nodes);
      const pageInfo: PageInfo = data.node.comments.pageInfo;
      after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
    } while (after);
    const messages: Message[] = [];
    for (const comment of comments) {
      messages.push(this.toMessage(comment, channelId));
      messages.push(
        ...(comment.replies?.nodes || []).map((reply) =>
          this.toMessage(reply, channelId, comment.id),
        ),
      );
      let replyCursor = comment.replies?.pageInfo.hasNextPage
        ? comment.replies.pageInfo.endCursor
        : null;
      while (replyCursor) {
        const data: {
          node: {
            replies: { nodes: GitHubComment[]; pageInfo: PageInfo };
          } | null;
        } = await this.graphql(
          `query Replies($id: ID!, $after: String) {
          node(id: $id) { ... on DiscussionComment { replies(first: 100, after: $after) {
            nodes { id body createdAt updatedAt url author { login }
              reactionGroups { content users { totalCount } viewerHasReacted } } pageInfo { hasNextPage endCursor } }
          } } }
        }`,
          { id: comment.id, after: replyCursor },
          repliesSchema,
          signal,
        );
        if (!data.node)
          throw new GitHubError(
            "A thread changed while syncing. Retry to refresh it.",
          );
        messages.push(
          ...data.node.replies.nodes.map((reply) =>
            this.toMessage(reply, channelId, comment.id),
          ),
        );
        const pageInfo: PageInfo = data.node.replies.pageInfo;
        replyCursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
      }
    }
    return messages;
  }

  async sendMessage(
    channelId: string,
    body: string,
    parentId?: string,
  ): Promise<Message> {
    const data = await this.graphql<{
      addDiscussionComment: { comment: GitHubComment };
    }>(
      `mutation Send($discussionId: ID!, $body: String!, $replyToId: ID) {
      addDiscussionComment(input: { discussionId: $discussionId, body: $body, replyToId: $replyToId }) {
        comment { id body createdAt updatedAt url author { login }
          reactionGroups { content users { totalCount } viewerHasReacted } }
      }
    }`,
      { discussionId: channelId, body, replyToId: parentId || null },
      z.object({ addDiscussionComment: z.object({ comment: commentSchema }) }),
    );
    return this.toMessage(
      data.addDiscussionComment.comment,
      channelId,
      parentId,
    );
  }

  private toMessage(
    comment: GitHubComment,
    channelId: string,
    parentId = "",
  ): Message {
    return {
      id: comment.id,
      channelId,
      parentId,
      author: comment.author?.login || "Deleted account",
      body: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      status: "saved",
      url: comment.url,
      reactions: comment.reactionGroups?.length
        ? toReactions(comment.reactionGroups)
        : undefined,
    };
  }

  async toggleReaction(
    messageId: string,
    content: ReactionContent,
    remove: boolean,
  ): Promise<MessageReaction[]> {
    const mutation = remove
      ? `mutation Unreact($subjectId: ID!, $content: ReactionContent!) {
          removeReaction(input: { subjectId: $subjectId, content: $content }) {
            subject { ... on DiscussionComment { reactionGroups { content users { totalCount } viewerHasReacted } } } }
        }`
      : `mutation React($subjectId: ID!, $content: ReactionContent!) {
          addReaction(input: { subjectId: $subjectId, content: $content }) {
            subject { ... on DiscussionComment { reactionGroups { content users { totalCount } viewerHasReacted } } } }
        }`;
    const data = await this.graphql(
      mutation,
      { subjectId: messageId, content },
      reactionToggleSchema,
    );
    const subject = (data.addReaction || data.removeReaction)?.subject;
    if (!subject)
      throw new GitHubError("This message is no longer available.");
    return toReactions(subject.reactionGroups);
  }
}
