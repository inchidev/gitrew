export interface Channel {
  id: string;
  name: string;
  description: string;
  url?: string;
  repository?: string;
  category?: { name: string; emoji: string } | null;
  /** ISO time of the latest conversation activity, for local unread markers. */
  activityAt?: string;
  /** Who started the conversation and when — feeds the intro message. */
  startedBy?: string;
  startedAt?: string;
  kind?: "public" | "private" | "dm";
}

export interface MessageReaction {
  emoji: string;
  count: number;
  /** GitHub ReactionContent name, set when the viewer can toggle it. */
  content?: string;
  /** Whether the signed-in viewer already added this reaction. */
  mine?: boolean;
}
// The exact emoji set GitHub supports on reactions, in picker order.
export const reactionEmoji = {
  THUMBS_UP: "👍",
  THUMBS_DOWN: "👎",
  LAUGH: "😄",
  HOORAY: "🎉",
  CONFUSED: "😕",
  HEART: "❤️",
  ROCKET: "🚀",
  EYES: "👀",
} as const;
export type ReactionContent = keyof typeof reactionEmoji;
export const quickReactions = Object.entries(reactionEmoji).map(
  ([content, emoji]) => ({ content: content as ReactionContent, emoji }),
);

export interface Message {
  id: string;
  channelId: string;
  parentId: string;
  author: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  status: "saved" | "local" | "pending" | "error";
  url: string;
  reactions?: MessageReaction[];
}

export interface Draft {
  id: string;
  body: string;
}

export interface ChatTransport {
  listChannels(signal?: AbortSignal): Promise<Channel[]>;
  listMessages(channelId: string, signal?: AbortSignal): Promise<Message[]>;
  sendMessage(
    channelId: string,
    body: string,
    parentId?: string,
  ): Promise<Message>;
}

export interface ChannelPage {
  channels: Channel[];
  hasMore: boolean;
}
export interface MessagePage {
  messages: Message[];
  hasMore: boolean;
}

// Optional deep-history extensions. Workspace shipments pre-load their whole
// history; a transport that pages (anonymous GitHub browsing) implements
// these to pull the next channel page and the older half of a conversation.
export interface PagingTransport extends ChatTransport {
  listMoreChannels(): Promise<ChannelPage>;
  listOlderMessages(channelId: string): Promise<MessagePage>;
}

// GitHub-backed transports can surface real discussion reactions; optional
// so vault and preview transports keep their plain send/read contract.
export interface ReactingTransport extends ChatTransport {
  toggleReaction(
    messageId: string,
    content: ReactionContent,
    remove: boolean,
  ): Promise<MessageReaction[]>;
}
