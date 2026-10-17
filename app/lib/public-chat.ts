// Read-only ChatTransport over the anonymous /api/public endpoints.
// Guests open the latest server pages (channels newest, messages at the end
// of the thread) and page backwards on demand — deep history stays one
// click away instead of loading everything at once. Sending always fails
// closed: guests participate on GitHub itself.
import type { Channel, ChatTransport, Message } from "../../shared/chat";
import {
  publicComments,
  publicDiscussions,
  type PublicComment,
  type PublicPageInfo,
} from "./public";

function message(
  comment: PublicComment,
  channelId: string,
  parentId: string,
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
    reactions: comment.reactions?.length ? comment.reactions : undefined,
  };
}

export class PublicTransport implements ChatTransport {
  private channelCursors: PublicPageInfo = {
    hasNextPage: false,
    endCursor: null,
  };
  private olderCursors = new Map<string, string | null>();
  private olderState = new Map<string, boolean>();

  constructor(
    private readonly owner: string,
    private readonly repo: string,
  ) {}

  async listChannels(): Promise<Channel[]> {
    const page = await publicDiscussions(this.owner, this.repo, null);
    this.channelCursors = page.pageInfo;
    return page.discussions.map((discussion) => ({
      id: discussion.id,
      name: discussion.title.replace(/^#/, ""),
      description: discussion.body,
      url: discussion.url,
      repository: `${this.owner}/${this.repo}`,
      category: discussion.category,
      kind: "public" as const,
    }));
  }

  async listMoreChannels(): Promise<{ channels: Channel[]; hasMore: boolean }> {
    const cursor = this.channelCursors.hasNextPage
      ? this.channelCursors.endCursor
      : null;
    if (!cursor) return { channels: [], hasMore: false };
    const page = await publicDiscussions(this.owner, this.repo, cursor);
    this.channelCursors = page.pageInfo;
    return {
      channels: page.discussions.map((discussion) => ({
        id: discussion.id,
        name: discussion.title.replace(/^#/, ""),
        description: discussion.body,
        url: discussion.url,
        repository: `${this.owner}/${this.repo}`,
        category: discussion.category,
        kind: "public" as const,
      })),
      hasMore: page.pageInfo.hasNextPage,
    };
  }

  hasMoreChannels(): boolean {
    return this.channelCursors.hasNextPage;
  }

  hasOlderMessages(channelId: string): boolean {
    return this.olderState.get(channelId) ?? false;
  }

  async listMessages(channelId: string): Promise<Message[]> {
    const page = await publicComments(channelId, null);
    this.olderCursors.set(channelId, page.pageInfo.startCursor);
    this.olderState.set(channelId, page.pageInfo.hasPreviousPage);
    const messages: Message[] = [];
    for (const comment of page.comments) {
      messages.push(message(comment, channelId, ""));
      messages.push(
        ...comment.replies.nodes.map((reply) =>
          message(reply, channelId, comment.id),
        ),
      );
    }
    return messages;
  }

  async listOlderMessages(
    channelId: string,
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const cursor = this.olderState.get(channelId)
      ? this.olderCursors.get(channelId)
      : null;
    if (!cursor) return { messages: [], hasMore: false };
    const page = await publicComments(channelId, cursor);
    this.olderCursors.set(channelId, page.pageInfo.startCursor);
    this.olderState.set(channelId, page.pageInfo.hasPreviousPage);
    const messages: Message[] = [];
    for (const comment of page.comments) {
      messages.push(message(comment, channelId, ""));
      messages.push(
        ...comment.replies.nodes.map((reply) =>
          message(reply, channelId, comment.id),
        ),
      );
    }
    return { messages, hasMore: page.pageInfo.hasPreviousPage };
  }

  async sendMessage(): Promise<Message> {
    throw new Error("Sign in to participate.");
  }
}
