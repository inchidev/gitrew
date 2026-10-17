export interface Channel {
  id: string;
  name: string;
  description: string;
  url?: string;
  repository?: string;
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
