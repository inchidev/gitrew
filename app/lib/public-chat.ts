// Read-only ChatTransport over the anonymous /api/public endpoints.
// First pages load the channel list and messages; reply threads expose the
// first page GitHub returns. Sending always fails closed: guests participate
// on GitHub itself.
import type { Channel, ChatTransport, Message } from "../../shared/chat";
import {
  publicComments,
  publicDiscussions,
  type PublicComment,
} from "./public";

function toMessage(
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
  };
}

export class PublicTransport implements ChatTransport {
  constructor(
    private readonly owner: string,
    private readonly repo: string,
  ) {}

  async listChannels(): Promise<Channel[]> {
    const channels: Channel[] = [];
    let after: string | null = null;
    do {
      const page = await publicDiscussions(this.owner, this.repo, after);
      channels.push(
        ...page.discussions.map((discussion) => ({
          id: discussion.id,
          name: discussion.title.replace(/^#/, ""),
          description: discussion.body,
          url: discussion.url,
          repository: `${this.owner}/${this.repo}`,
          kind: "public" as const,
        })),
      );
      after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (after);
    return channels;
  }

  async listMessages(channelId: string): Promise<Message[]> {
    const messages: Message[] = [];
    let after: string | null = null;
    do {
      const page = await publicComments(channelId, after);
      for (const comment of page.comments) {
        messages.push(toMessage(comment, channelId, ""));
        messages.push(
          ...comment.replies.nodes.map((reply) =>
            toMessage(reply, channelId, comment.id),
          ),
        );
      }
      after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (after);
    return messages;
  }

  async sendMessage(): Promise<Message> {
    throw new Error("Sign in to participate.");
  }
}
