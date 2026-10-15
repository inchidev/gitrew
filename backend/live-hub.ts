import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import { joinMedia, leaveMedia, type HuddleLease } from "./huddles";
import type { BackendEnv } from "./worker";
export interface LiveIdentity {
  userId: number;
  login: string;
  sessionId: string;
  expires: number;
  channel: string;
  kind: string;
  lastTyping: number;
}
const clientEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("typing"), active: z.boolean() }),
  z.object({ type: z.literal("ping") }),
]);
// A workspace coordinates live subscriptions; private events only reach their room.
// Message bodies never enter socket attachments or durable storage.
export class LiveHub extends DurableObject<BackendEnv> {
  constructor(ctx: DurableObjectState, env: BackendEnv) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS rates(id TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL)",
    );
  }
  consumeRate(id: string, limit: number) {
    const now = Date.now();
    this.ctx.storage.sql.exec("DELETE FROM rates WHERE expires < ?", now);
    const row = this.ctx.storage.sql
      .exec<{ count: number }>(
        "INSERT INTO rates VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count",
        `${id}:${Math.floor(now / 60000)}`,
        now + 120000,
      )
      .one();
    return row.count <= limit;
  }
  private queue: Promise<unknown> = Promise.resolve();
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.then(action);
    this.queue = next.catch(() => undefined);
    return next;
  }
  async joinHuddle(
    channel: string,
    login: string,
    userId: number,
    sessionId: string,
  ) {
    return this.serial(async () => {
      // Remove a previous lease for this browser before adding another participant.
      const leases = await this.ctx.storage.list<HuddleLease>({
        prefix: "huddle:",
      });
      for (const [key, lease] of leases)
        if (lease.sessionId === sessionId) {
          await leaveMedia(this.env, lease);
          await this.ctx.storage.delete(key);
        }
      const meeting = await this.ctx.storage.get<string>("meeting:" + channel);
      const result = await joinMedia(this.env, channel, login, userId, meeting);
      const id = crypto.randomUUID(),
        lease: HuddleLease = {
          id,
          sessionId,
          userId,
          login,
          channel,
          provider: result.provider,
          meeting: result.meeting,
          participant: result.participant,
          expires: Date.now() + 90_000,
        };
      await this.ctx.storage.put({
        ["meeting:" + channel]: result.meeting,
        ["huddle:" + id]: lease,
      });
      await this.ctx.storage.setAlarm(Date.now() + 30_000);
      await this.huddleState(channel);
      return { ...result, lease: id };
    });
  }
  async heartbeatHuddle(id: string, sessionId: string) {
    return this.serial(async () => {
      const lease = await this.ctx.storage.get<HuddleLease>("huddle:" + id);
      if (!lease || lease.sessionId !== sessionId) return false;
      lease.expires = Date.now() + 90_000;
      await this.ctx.storage.put("huddle:" + id, lease);
      return true;
    });
  }
  async leaveHuddle(id: string, sessionId: string) {
    return this.serial(async () => {
      const lease = await this.ctx.storage.get<HuddleLease>("huddle:" + id);
      if (!lease || lease.sessionId !== sessionId) return;
      await leaveMedia(this.env, lease);
      await this.ctx.storage.delete("huddle:" + id);
      await this.huddleState(lease.channel);
    });
  }
  override async alarm() {
    await this.serial(async () => {
      const leases = await this.ctx.storage.list<HuddleLease>({
        prefix: "huddle:",
      });
      let pending = false;
      for (const [key, lease] of leases) {
        if (lease.expires > Date.now()) {
          pending = true;
          continue;
        }
        try {
          await leaveMedia(this.env, lease);
          await this.ctx.storage.delete(key);
          await this.huddleState(lease.channel);
        } catch {
          pending = true;
        }
      }
      if (pending) await this.ctx.storage.setAlarm(Date.now() + 30_000);
    });
  }
  private send(ws: WebSocket, event: unknown) {
    try {
      ws.send(JSON.stringify(event));
    } catch {
      /* Reconnect resynchronizes authorized history. */
    }
  }
  private valid(ws: WebSocket) {
    const a = ws.deserializeAttachment() as LiveIdentity;
    if (a.expires <= Date.now()) {
      ws.close(4001, "Reauthorize");
      return null;
    }
    return a;
  }
  override async fetch(request: Request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("WebSocket required", { status: 426 });
    const identity = JSON.parse(
      request.headers.get("X-Gitrew-Live")!,
    ) as LiveIdentity;
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment(identity);
    this.send(pair[1], { type: "ready", expires: identity.expires });
    this.presence(identity.channel);
    await this.huddleState(identity.channel);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  emit(channel: string, event: unknown) {
    for (const ws of this.ctx.getWebSockets()) {
      const a = this.valid(ws);
      if (a && (!channel || a.channel === channel)) this.send(ws, event);
    }
  }
  presence(channel: string) {
    const members = new Map<number, string>();
    for (const ws of this.ctx.getWebSockets()) {
      const a = this.valid(ws);
      if (a && a.channel === channel && ws.readyState === 1)
        members.set(a.userId, a.login);
    }
    this.emit(channel, {
      type: "presence",
      members: [...members].map(([id, login]) => ({ id, login })),
    });
  }
  async huddleState(channel: string) {
    const leases = await this.ctx.storage.list<HuddleLease>({
      prefix: "huddle:",
    });
    const members = [
      ...new Set(
        [...leases.values()]
          .filter((l) => l.channel === channel && l.expires > Date.now())
          .map((l) => l.login),
      ),
    ];
    this.emit(channel, { type: "huddle", members });
  }
  async revoke(userId: number, sessionId?: string) {
    const rooms = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as LiveIdentity;
      if (a.userId === userId && (!sessionId || a.sessionId === sessionId)) {
        rooms.add(a.channel);
        ws.close(4001, "Access ended");
      }
    }
    for (const room of rooms) this.presence(room);
    await this.serial(async () => {
      const leases = await this.ctx.storage.list<HuddleLease>({
        prefix: "huddle:",
      });
      for (const [key, lease] of leases)
        if (
          lease.userId === userId &&
          (!sessionId || lease.sessionId === sessionId)
        ) {
          lease.expires = Date.now();
          await this.ctx.storage.put(key, lease);
          try {
            await leaveMedia(this.env, lease);
            await this.ctx.storage.delete(key);
          } catch {
            await this.ctx.storage.setAlarm(Date.now() + 30_000);
          }
          await this.huddleState(lease.channel);
        }
    });
  }
  override webSocketMessage(ws: WebSocket, input: string | ArrayBuffer) {
    const a = this.valid(ws);
    if (!a) return;
    if (typeof input !== "string" || input.length > 200) {
      ws.close(1008, "Invalid event");
      return;
    }
    let event;
    try {
      event = clientEvent.parse(JSON.parse(input));
    } catch {
      ws.close(1008, "Invalid event");
      return;
    }
    if (event.type === "ping") {
      this.send(ws, { type: "pong" });
      return;
    }
    if (Date.now() - a.lastTyping < 2000) return;
    a.lastTyping = Date.now();
    ws.serializeAttachment(a);
    this.emit(a.channel, {
      type: "typing",
      userId: a.userId,
      login: a.login,
      active: event.active,
    });
  }
  override webSocketClose(ws: WebSocket, code: number, reason: string) {
    const a = ws.deserializeAttachment() as LiveIdentity;
    ws.close(code, reason);
    this.presence(a.channel);
  }
  override webSocketError(ws: WebSocket) {
    const a = ws.deserializeAttachment() as LiveIdentity;
    ws.close(1011, "Reconnect");
    this.presence(a.channel);
  }
}
