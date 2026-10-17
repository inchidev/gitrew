// Read-only ChatTransport over the anonymous /api/public endpoints.
// First load shows only the first server page of channels and messages so
// huge repositories open instantly; deeper history stays on GitHub. Sending
// always fails closed: guests participate on GitHub itself.
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
    reactions: comment.reactions?.length ? comment.reactions : undefined,
  };
}

export class PublicTransport implements ChatTransport {
  constructor(
    private readonly owner: string,
    private readonly repo: string,
  ) {}

  async listChannels(): Promise<Channel[]> {
    const page = await publicDiscussions(this.owner, this.repo, null);
    return page.discussions.map((discussion) => ({
      id: discussion.id,
      name: discussion.title.replace(/^#/, ""),
      description: discussion.body,
      url: discussion.url,
      repository: `${this.owner}/${this.repo}`,
      kind: "public" as const,
    }));
  }

  async listMessages(channelId: string): Promise<Message[]> {
    const page = await publicComments(channelId, null);
    const messages: Message[] = [];
    for (const comment of page.comments) {
      messages.push(toMessage(comment, channelId, ""));
      messages.push(
        ...comment.replies.nodes.map((reply) =>
          toMessage(reply, channelId, comment.id),
        ),
      );
    }
    return messages;
  }

  async sendMessage(): Promise<Message> {
    throw new Error("Sign in to participate.");
  }
}
