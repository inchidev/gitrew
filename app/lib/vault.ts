import { z } from "zod";
import type { Channel, ChatTransport, Message } from "../../shared/chat";
import type { MailboxConfig } from "../../shared/mailbox";
import { vaultRequest } from "./mailbox";
const channelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  kind: z.enum(["private", "dm"]),
});
const messageSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  parentId: z.string(),
  author: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.literal("saved"),
  url: z.string(),
});
const pendingSends = new Map<string, string>();
const joined = new Set<string>();
export function clearVaultSends() {
  pendingSends.clear();
  joined.clear();
}
export class VaultTransport implements ChatTransport {
  constructor(
    private config: MailboxConfig,
    private token: string,
  ) {}
  async listChannels(signal?: AbortSignal): Promise<Channel[]> {
    // The server uses its private member policy; public config only enables the UI flow.
    const key = `${this.config.repository}:${this.token}`;
    if (this.config.openRegistration && !joined.has(key)) {
      await vaultRequest(this.config, this.token, { op: "join" }, signal);
      joined.add(key);
    }
    return z
      .object({ channels: z.array(channelSchema) })
      .parse(
        await vaultRequest(this.config, this.token, { op: "list" }, signal),
      ).channels;
  }
  async listMessages(
    channelId: string,
    signal?: AbortSignal,
  ): Promise<Message[]> {
    return z
      .object({ messages: z.array(messageSchema) })
      .parse(
        await vaultRequest(
          this.config,
          this.token,
          { op: "read", conversation: channelId },
          signal,
        ),
      ).messages;
  }
  async sendMessage(
    channelId: string,
    body: string,
    parentId?: string,
  ): Promise<Message> {
    if (!body.trim() || body.length > 6000)
      throw new Error("Private messages must contain 1–6000 characters.");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify([
          this.token,
          this.config.repository,
          channelId,
          parentId || "",
          body,
        ]),
      ),
    );
    const key = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const nonce = pendingSends.get(key) || crypto.randomUUID();
    pendingSends.set(key, nonce);
    if (pendingSends.size > 256)
      pendingSends.delete(pendingSends.keys().next().value!);
    const message = z.object({ message: messageSchema }).parse(
      await vaultRequest(
        this.config,
        this.token,
        {
          op: "send",
          conversation: channelId,
          body,
          parentId: parentId || undefined,
        },
        undefined,
        nonce,
      ),
    ).message;
    pendingSends.delete(key);
    return message;
  }
}
