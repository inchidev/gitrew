import { z } from "zod";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { EncryptedStore } from "./encryption";
import { hash, HttpError } from "./security";
import { authenticated } from "./github";
import { authorizeRoom, type Room } from "./live-access";
import type { App, BackendStore } from "./store";
export interface PushEnv {
  DB?: D1Database;
  SETUP_TOKEN: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}
// Only known browser push gateways can receive outbound requests. Reject arbitrary
// user supplied URLs (including localhost/private services) and redirects.
export const subscriptionSchema = z.object({
  endpoint: z
    .url()
    .max(2048)
    .refine((value) => {
      const u = new URL(value);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.port &&
        [
          "fcm.googleapis.com",
          "updates.push.services.mozilla.com",
          "push.services.mozilla.com",
          "web.push.apple.com",
        ].includes(u.hostname)
      );
    }, "Unsupported browser push service."),
  expirationTime: z.number().nullable().optional().default(null),
  keys: z.object({
    p256dh: z.string().regex(/^[\w-]{80,100}$/),
    auth: z.string().regex(/^[\w-]{20,30}$/),
  }),
});
export function pushEnabled(env: PushEnv) {
  return Boolean(
    env.DB &&
    env.VAPID_PUBLIC_KEY &&
    env.VAPID_PRIVATE_KEY &&
    env.VAPID_SUBJECT,
  );
}
export class PushStore extends EncryptedStore {
  constructor(private env: PushEnv) {
    super(env.SETUP_TOKEN);
  }
  async initialize() {
    await this.env.DB!.exec(
      "CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,session_id TEXT NOT NULL,organization TEXT NOT NULL,channel TEXT NOT NULL,kind TEXT NOT NULL,value TEXT NOT NULL); CREATE INDEX IF NOT EXISTS push_room ON push_subscriptions(organization,channel); CREATE TABLE IF NOT EXISTS push_events (id TEXT PRIMARY KEY,expires INTEGER NOT NULL);",
    );
  }
  async save(
    userId: number,
    sessionId: string,
    room: Room,
    subscription: z.infer<typeof subscriptionSchema>,
  ) {
    await this.initialize();
    const id = await hash(
      subscription.endpoint + ":" + room.organization + ":" + room.channel,
    );
    const count = await this.env
      .DB!.prepare(
        "SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id=?",
      )
      .bind(userId)
      .first<{ count: number }>();
    if (
      (count?.count || 0) >= 50 &&
      !(await this.env
        .DB!.prepare(
          "SELECT id FROM push_subscriptions WHERE id=? AND user_id=?",
        )
        .bind(id, userId)
        .first())
    )
      throw new HttpError(
        429,
        "Limit reached. Disable unused conversation notifications first.",
      );
    await this.env
      .DB!.prepare(
        "INSERT INTO push_subscriptions VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,session_id=excluded.session_id,value=excluded.value",
      )
      .bind(
        id,
        userId,
        sessionId,
        room.organization,
        room.channel,
        room.kind,
        await this.seal(subscription, "push:" + id),
      )
      .run();
  }
  async remove(userId: number, endpoint: string, room: Room) {
    await this.initialize();
    await this.env
      .DB!.prepare("DELETE FROM push_subscriptions WHERE id=? AND user_id=?")
      .bind(
        await hash(endpoint + ":" + room.organization + ":" + room.channel),
        userId,
      )
      .run();
  }
  async revoke(sessionId: string) {
    await this.initialize();
    await this.env
      .DB!.prepare("DELETE FROM push_subscriptions WHERE session_id=?")
      .bind(sessionId)
      .run();
  }
  async notify(
    store: BackendStore,
    app: App,
    organization: string,
    channel: string,
    eventId: string,
    senderId?: number,
  ) {
    if (!pushEnabled(this.env)) return;
    await this.initialize();
    const inserted = await this.env
      .DB!.prepare("INSERT OR IGNORE INTO push_events VALUES(?,?) RETURNING id")
      .bind(eventId, Date.now() + 86400_000)
      .first();
    if (!inserted) return;
    await this.env
      .DB!.prepare("DELETE FROM push_events WHERE expires<?")
      .bind(Date.now())
      .run();
    const rows = await this.env
      .DB!.prepare(
        "SELECT * FROM push_subscriptions WHERE organization=? AND channel=? LIMIT 200",
      )
      .bind(organization, channel)
      .all<{
        id: string;
        user_id: number;
        session_id: string;
        kind: Room["kind"];
        value: string;
      }>();
    await Promise.all(
      rows.results.map(async (row) => {
        if (row.user_id === senderId) return;
        try {
          const session = await this.env
            .DB!.prepare(
              "SELECT expires FROM sessions WHERE id=? AND expires>?",
            )
            .bind(row.session_id, Date.now())
            .first<{ expires: number }>();
          if (!session) {
            await this.env
              .DB!.prepare("DELETE FROM push_subscriptions WHERE id=?")
              .bind(row.id)
              .run();
            return;
          }
          const { api, actor } = await authenticated(
            store,
            {
              id: row.session_id,
              userId: row.user_id,
              csrf: "",
              expires: session.expires,
              credentials: await store.reloadCredentials(row.session_id),
            },
            app,
            organization,
            (await store.workspace(organization))?.allowedTeam ?? app.allowedTeam,
          );
          await authorizeRoom(store, app, api, actor, {
            organization,
            channel,
            kind: row.kind,
          });
          const subscription = subscriptionSchema.parse(
            await this.open(row.value, "push:" + row.id),
          );
          const payload = await buildPushPayload(
            {
              data: {
                title: "Gitrew",
                body: "New activity in a conversation you follow.",
                url: `/w/${organization}/c/${encodeURIComponent(channel)}`,
              },
              options: {
                ttl: 60,
                topic: (await hash(organization + channel)).slice(0, 32),
              },
            },
            subscription,
            {
              subject: this.env.VAPID_SUBJECT,
              publicKey: this.env.VAPID_PUBLIC_KEY,
              privateKey: this.env.VAPID_PRIVATE_KEY,
            },
          );
          const result = await fetch(subscription.endpoint, {
            ...payload,
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
          });
          if ([404, 410].includes(result.status))
            await this.env
              .DB!.prepare("DELETE FROM push_subscriptions WHERE id=?")
              .bind(row.id)
              .run();
        } catch (e) {
          if (e instanceof HttpError && [401, 403, 404].includes(e.status))
            await this.env
              .DB!.prepare("DELETE FROM push_subscriptions WHERE id=?")
              .bind(row.id)
              .run();
        }
      }),
    );
  }
}
