export interface Channel {
  id: string;
  name: string;
  description: string;
  url?: string;
  repository?: string;
  category?: { name: string; emoji: string } | null;
  kind?: "public" | "private" | "dm";
}

export interface MessageReaction {
  emoji: string;
  count: number;
}

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
