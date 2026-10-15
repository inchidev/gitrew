import { describe, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { PushStore, subscriptionSchema } from "../backend/push";
import { Store } from "../backend/store";
describe("notification registration", () => {
  it("rejects arbitrary push endpoints and stores browser subscription credentials encrypted", async () => {
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/test",
      expirationTime: null,
      keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
    };
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/test",
      "https://localhost/",
      "https://127.0.0.1/",
      "https://fcm.googleapis.com.evil.test/",
      "https://you:secret@fcm.googleapis.com/",
      "https://fcm.googleapis.com:9877/",
    ])
      expect(
        subscriptionSchema.safeParse({ ...subscription, endpoint }).success,
      ).toBe(false);
    const mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: 'export default {fetch(){return new Response("ok")}}',
        d1Databases: ["DB"],
      }),
    );
    try {
      const db = await mf.getD1Database("DB"),
        key = "test-push-encryption-key-at-least-32-characters";
      await new Store(db as unknown as D1Database, key).initialize();
      const push = new PushStore({
          DB: db as unknown as D1Database,
          SETUP_TOKEN: key,
        }),
        room = {
          organization: "team",
          channel: "private-channel",
          kind: "private" as const,
        };
      await push.save(
        2,
        "session-id",
        room,
        subscriptionSchema.parse(subscription),
      );
      const rows = await db
        .prepare("SELECT value FROM push_subscriptions")
        .all<{ value: string }>();
      expect(rows.results).toHaveLength(1);
      expect(rows.results[0]!.value).not.toContain("fcm.googleapis.com");
      expect(rows.results[0]!.value).not.toContain(subscription.keys.auth);
      await push.remove(3, subscription.endpoint, room);
      expect(
        (await db.prepare("SELECT id FROM push_subscriptions").all()).results,
      ).toHaveLength(1);
      await push.revoke("session-id");
      expect(
        (await db.prepare("SELECT id FROM push_subscriptions").all()).results,
      ).toHaveLength(0);
    } finally {
      await mf.dispose();
    }
  });
});
