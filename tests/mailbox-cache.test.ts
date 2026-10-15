import { afterEach, expect, it, vi } from "vitest";
import { mailboxReplies, prepareMailbox } from "../app/lib/mailbox";
import { newMailboxKey, seal, REPLY_PREFIX } from "../shared/mailbox";

afterEach(() => vi.unstubAllGlobals());

it("sees a newly published encrypted reply after an initially empty cacheable mailbox response", async () => {
  const server = await newMailboxKey();
  const pending = await prepareMailbox({
    version: 1,
    repository: "acme/gitrew-auth",
    clientId: "workspace-app",
    appSlug: "workspace-app",
    publicKey: server.publicKey,
  });
  pending.issue = 1;
  let published: { id: number; body: string }[] = [];
  let cached: typeof published | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options: RequestInit) => {
      // GitHub sends max-age=60. Emulate a fresh HTTP cache entry, not a failed request.
      if (options.cache !== "no-store" && cached) return Response.json(cached);
      const snapshot = structuredClone(published);
      if (options.cache !== "no-store") cached = snapshot;
      return Response.json(snapshot, {
        headers: { "Cache-Control": "private, max-age=60" },
      });
    }),
  );
  expect(await mailboxReplies(pending)).toEqual([]);
  published = [
    {
      id: 42,
      body:
        REPLY_PREFIX +
        JSON.stringify(
          await seal(
            server.privateKey,
            server.publicKey,
            pending.request.publicKey,
            pending.request.id,
            {
              id: pending.request.id,
              kind: "probe",
              login: "alice",
              userId: 1,
            },
          ),
        ),
    },
  ];
  expect(await mailboxReplies(pending)).toEqual([
    expect.objectContaining({ kind: "probe", login: "alice", userId: 1 }),
  ]);
});
