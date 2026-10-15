import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  Miniflare,
  convertV4MiniflareOptions,
  Response as MFResponse,
} from "miniflare";
import { build } from "esbuild";
import { createHmac, generateKeyPairSync } from "node:crypto";
import { Store, type Workspace } from "../backend/store";

const origin = "https://gitrew.test",
  secret = "test-only-setup-key-with-at-least-32-characters";
const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
const app = {
  id: 123,
  slug: "gitrew-test",
  client_id: "client-id",
  client_secret: "private-client-secret",
  pem: privateKey,
  webhook_secret: "private-webhook-secret",
  owner: { login: "team" },
};
const response = (value: unknown, status = 200) =>
  new MFResponse(status === 204 ? null : JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
let mf: Miniflare,
  store: Store,
  currentUser = 1,
  revoked = false,
  wrongOwner = false,
  basePermission = "none",
  tokenRevocations = 0;
let ownerRole: "admin" | "member" | "outside" = "admin";
let inviteeState: "active" | "pending" | "outside" = "active";
let inviteeIdentity = 2;
let customRepos = new Map<
  string,
  {
    id: number;
    private: boolean;
    description: string;
    has_discussions: boolean;
  }
>();
let chatPrivate = true;
let failMediaCleanup = false;
let chatReaders = new Set([1, 2, 3]);
let selfMembershipState = "active";
let failChatGrant = false;
let teamState = "active";
let teamStatus = 200;
let customMembersInitialized = false;
let failCustomChannel = false;
let githubCalls: {
  url: string;
  authorization: string;
  method: string;
  body: unknown;
}[] = [];
let membership = {
  version: 1,
  organization: "team",
  admins: [1],
  members: [
    { id: 1, login: "user1" },
    { id: 2, login: "user2" },
    { id: 3, login: "user3" },
  ],
  openRegistration: false,
  memberPrivateChannels: false,
  blocked: [] as number[],
};
const cookieValue = (header: string | null) => header?.split(";")[0] || "";
async function request(path: string, init: RequestInit = {}) {
  return mf.dispatchFetch(origin + path, { redirect: "manual", ...init });
}
async function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return request(path, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
async function register() {
  const start = await post("/api/setup/start", {
    organization: "team",
    setupToken: secret,
  });
  expect(start.status).toBe(200);
  const data = (await start.json()) as { action: string; manifest: string };
  const state = new URL(data.action).searchParams.get("state");
  const callback = await request(
    `/api/setup/callback?code=manifest-code&state=${state}`,
    { headers: { Cookie: cookieValue(start.headers.get("set-cookie")) } },
  );
  expect(callback.status).toBe(303);
  return data;
}
async function login(id = 1) {
  currentUser = id;
  const start = await request("/api/auth/start");
  expect(start.status).toBe(303);
  const state = new URL(start.headers.get("location")!).searchParams.get(
    "state",
  )!;
  const result = await request(
    `/api/auth/callback?code=oauth-code&state=${state}`,
    { headers: { Cookie: cookieValue(start.headers.get("set-cookie")) } },
  );
  expect(result.status).toBe(303);
  const cookies = result.headers.getSetCookie();
  const cookie = cookieValue(
    cookies.find((c) => c.startsWith("__Host-gitrew_session=")) || null,
  );
  const session = await request("/api/session", {
    headers: { Cookie: cookie },
  });
  expect(session.status).toBe(200);
  const data = (await session.json()) as { csrf: string };
  return {
    cookie,
    csrf: data.csrf,
    sessionCookie: cookies.find((c) => c.startsWith("__Host-gitrew_session="))!,
    state,
    flowCookie: cookieValue(start.headers.get("set-cookie")),
  };
}
const sessionHeaders = (session: { cookie: string; csrf: string }) => ({
  Cookie: session.cookie,
  "X-Gitrew-CSRF": session.csrf,
});

beforeAll(async () => {
  await build({
    entryPoints: ["backend/cloudflare.ts"],
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2022",
    external: ["node:*", "cloudflare:*"],
    outfile: "artifacts/backend-test-worker.mjs",
  });
});
beforeEach(async () => {
  currentUser = 1;
  chatPrivate = true;
  failMediaCleanup = false;
  chatReaders = new Set([1, 2, 3]);
  selfMembershipState = "active";
  failChatGrant = false;
  teamState = "active";
  teamStatus = 200;
  revoked = false;
  wrongOwner = false;
  basePermission = "none";
  githubCalls = [];
  customRepos = new Map();
  customMembersInitialized = false;
  failCustomChannel = false;
  tokenRevocations = 0;
  ownerRole = "admin";
  inviteeState = "active";
  inviteeIdentity = 2;
  membership = {
    version: 1,
    organization: "team",
    admins: [1],
    members: [
      { id: 1, login: "user1" },
      { id: 2, login: "user2" },
      { id: 3, login: "user3" },
    ],
    openRegistration: false,
    memberPrivateChannels: false,
    blocked: [],
  };
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: "artifacts/backend-test-worker.mjs",
      compatibilityDate: "2026-10-14",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      durableObjects: { LIVE: { className: "LiveHub", useSQLite: true } },
      bindings: {
        SETUP_TOKEN: secret,
        PUBLIC_APP: "false",
        SANDBOX_ORGANIZATION: "team",
        HUDDLE_PROVIDER: "realtimekit",
        RTK_ACCOUNT_ID: "account",
        RTK_APP_ID: "app",
        RTK_API_TOKEN: "test-only-media-secret",
        RTK_PRESET: "voice",
      },
      serviceBindings: { ASSETS: () => new MFResponse("client") },
      outboundService: async (req) => {
        const url = new URL(req.url),
          authorization = req.headers.get("Authorization") || "",
          method = req.method;
        const raw = await req.text();
        const body = raw ? JSON.parse(raw) : undefined;
        githubCalls.push({ url: req.url, authorization, method, body });
        if (url.hostname === "api.cloudflare.com") {
          if (url.pathname.endsWith("/active-session/kick") && failMediaCleanup)
            return response({ success: false }, 503);
          if (url.pathname.endsWith("/participants") && method === "POST")
            return response({
              success: true,
              data: {
                id: crypto.randomUUID(),
                token: "test-only-participant-token",
              },
            });
          if (url.pathname.endsWith("/meetings") && method === "POST")
            return response({ success: true, data: { id: "test-meeting" } });
          return response({ success: true, data: {} });
        }
        if (url.pathname.startsWith("/app-manifests/"))
          return response({
            ...app,
            owner: { login: wrongOwner ? "wrong-owner" : "team" },
          });
        if (url.pathname === "/login/oauth/access_token")
          return response({
            access_token: `private-user-token-${currentUser}`,
            token_type: "bearer",
            expires_in: 28800,
            refresh_token: `private-refresh-token-${currentUser}`,
            refresh_token_expires_in: 15897600,
          });
        if (url.pathname === "/user") {
          if (revoked) return response({ message: "Bad credentials" }, 401);
          const id = Number(
            authorization.match(/private-user-token-(\d+)/)?.[1] || currentUser,
          );
          return response({ id, login: `user${id}` });
        }
        if (url.pathname === "/users/user2")
          return response({ id: 2, login: "user2", type: "User" });
        if (url.pathname === "/user/memberships/orgs/team")
          return selfMembershipState === "outside"
            ? response({ message: "Not found" }, 404)
            : response({ role: "admin", state: selfMembershipState });
        if (url.pathname === "/orgs/team")
          return response({ default_repository_permission: basePermission });
        if (
          /^\/orgs\/team\/teams\/crew\/memberships\/user\d+$/.test(url.pathname)
        )
          return response({ state: teamState, role: "member" }, teamStatus);
        if (url.pathname.startsWith("/orgs/team/memberships/user")) {
          const id = Number(url.pathname.split("user").at(-1));
          if (id === 1 && ownerRole === "outside")
            return response({ message: "Not found" }, 404);
          if (id === 2 && inviteeState === "outside")
            return response({ message: "Not found" }, 404);
          return response({
            state: id === 2 ? inviteeState : "active",
            role: id === 1 ? ownerRole : "member",
            user: { id: id === 2 ? inviteeIdentity : id, login: `user${id}` },
          });
        }
        if (url.pathname === "/user/installations")
          return response({
            total_count: 1,
            installations: [{ id: 9, app_id: 123, account: { login: "team" } }],
          });
        if (url.pathname === "/orgs/team/repos" && method === "POST") {
          const repo = body as {
            name: string;
            private: boolean;
            description: string;
            has_discussions: boolean;
          };
          if (!repo.name.startsWith("custom-test-"))
            throw new Error("Unexpected repository creation");
          const saved = { ...repo, id: customRepos.size + 50 };
          customRepos.set(repo.name, saved);
          return response(saved, 201);
        }
        if (url.pathname === "/orgs/team/members")
          return response([{ id: 1, login: "user1" }]);
        const customRepo = /^\/repos\/team\/(custom-test-[^/]+)(.*)$/.exec(
          url.pathname,
        );
        if (customRepo) {
          const repo = customRepos.get(customRepo[1]!);
          const suffix = customRepo[2];
          if (!repo) return response({ message: "Not found" }, 404);
          if (suffix === "") return response(repo);
          if (suffix === "/installation") return response({ id: 9 });
          if (suffix === "/collaborators") return response([{ id: 1 }]);
          if (
            suffix?.startsWith("/contents/") &&
            !customMembersInitialized &&
            method === "GET"
          )
            return response({ message: "Not found" }, 404);
          if (suffix?.startsWith("/contents/") && method === "PUT")
            customMembersInitialized = true;
        }
        if (url.pathname === "/repos/team/gitrew-chat/installation")
          return response({ id: 9 });
        if (
          url.pathname.startsWith("/repos/team/gitrew-chat/collaborators/") &&
          method === "PUT"
        ) {
          if (failChatGrant) return response({ message: "Forbidden" }, 403);
          chatReaders.add(Number(url.pathname.split("user").at(-1)));
          return response(null, 204);
        }
        if (url.pathname === "/repos/team/gitrew-chat") {
          const id = Number(
            authorization.match(/private-user-token-(\d+)/)?.[1],
          );
          if (id && !chatReaders.has(id))
            return response({ message: "Not found" }, 404);
          return response({
            id: 10,
            private: chatPrivate,
            description: "unrelated repository",
            has_discussions: true,
          });
        }
        if (url.pathname === "/repos/team/gitrew-vault/installation")
          return response({ id: 9 });
        if (url.pathname === "/app/installations/9/access_tokens")
          return response({ token: "private-installation-token" });
        if (url.pathname === "/repos/team/gitrew-vault")
          return response({ id: 11, private: true });
        if (url.pathname.endsWith("/.gitrew/members.json")) {
          if (method === "PUT") {
            membership = JSON.parse(
              Buffer.from(
                (body as { content: string }).content,
                "base64",
              ).toString(),
            );
            return response({});
          }
          return response({
            sha: "members-sha",
            content: Buffer.from(JSON.stringify(membership)).toString("base64"),
          });
        }
        if (url.pathname === "/repos/team/gitrew-vault/collaborators")
          return response([{ id: 1 }]);
        if (url.pathname === "/installation/token" && method === "DELETE") {
          tokenRevocations++;
          return response(null, 204);
        }
        if (url.pathname === "/graphql") {
          const query = (body as { query: string }).query;
          if (query.includes("query Room"))
            return response({
              data: {
                node: {
                  __typename: "Discussion",
                  repository: {
                    nameWithOwner:
                      (body as { variables: { id: string } }).variables.id ===
                      "general"
                        ? "team/gitrew-chat"
                        : "other/repository",
                  },
                },
              },
            });
          if (query.includes("discussions(first:1)")) {
            if (failCustomChannel)
              return response({
                errors: [{ message: "Temporary GitHub error" }],
              });
            expect(
              (body as { variables: { name: string } }).variables.name,
            ).toBe("custom-test-chat");
            return response({
              data: {
                repository: {
                  id: "custom-chat-id",
                  discussionCategories: {
                    nodes: [{ id: "category", slug: "general" }],
                  },
                  discussions: { totalCount: 0 },
                },
              },
            });
          }
          if (query.includes("createDiscussion"))
            return response({
              data: { createDiscussion: { discussion: { id: "general" } } },
            });
          if (query.includes("query Vault"))
            return response({
              data: {
                repository: {
                  id: "vault-repository-id",
                  discussionCategories: {
                    nodes: [{ id: "category", slug: "general" }],
                  },
                  discussions: {
                    nodes: [
                      {
                        id: "private-channel",
                        title: "private",
                        body: JSON.stringify({
                          version: 1,
                          id: "internal-private",
                          kind: "private",
                          name: "Only Alice and Bob",
                          members: [1, 2],
                        }),
                        url: "",
                      },
                    ],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              },
            });
          if (query.includes("query Read"))
            return response({
              data: {
                node: {
                  comments: {
                    nodes: [
                      {
                        id: "comment",
                        body: JSON.stringify({
                          version: 1,
                          type: "message",
                          nonce: "original",
                          author: { id: 1, login: "user1" },
                          body: "Private conversation content",
                        }),
                        createdAt: "2026-10-14T00:00:00Z",
                        updatedAt: "2026-10-14T00:00:00Z",
                      },
                    ],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              },
            });
          return response({
            data: { viewer: { login: `user${currentUser}` } },
          });
        }
        throw new Error("Unexpected outbound request: " + req.url);
      },
    }),
  );
  await request("/api/config");
  store = new Store(await mf.getD1Database("DB"), secret);
});
afterEach(async () => {
  await mf?.dispose();
});

describe("Cloudflare backend", () => {
  it("enforces team membership on session, proxy, vault, realtime, huddles and push, including removal", async () => {
    await register();
    await store.saveWorkspace({
      organization: "team",
      repository: "team/gitrew-chat",
      vault: "team/gitrew-vault",
      installationId: 9,
      nonce: "workspace-nonce",
      ready: true,
      openRegistration: false,
      memberPrivateChannels: false,
    });
    const owner = await login(1),
      bob = await login(2);
    await (
      await mf.getD1Database("DB")
    )
      .prepare("UPDATE settings SET value=? WHERE key='app'")
      .bind(await store.seal({ ...app, origin, allowedTeam: "crew" }, "app"))
      .run();
    expect(
      (await request("/api/session", { headers: { Cookie: bob.cookie } }))
        .status,
    ).toBe(200);
    chatReaders.delete(2);
    const before = githubCalls.length;
    expect(
      (await request("/api/session", { headers: { Cookie: bob.cookie } }))
        .status,
    ).toBe(403);
    expect(
      githubCalls
        .slice(before)
        .some((c) => c.method === "PUT" && c.url.includes("/collaborators/")),
    ).toBe(false);
    chatReaders.add(2);
    const ticket = await post(
      "/api/live/ticket",
      { organization: "team", channel: "general", kind: "public" },
      sessionHeaders(bob),
    );
    expect(ticket.status).toBe(200);
    const { ticket: socketTicket } = (await ticket.json()) as {
      ticket: string;
    };
    const connected = await request("/api/live/socket?ticket=" + socketTicket, {
      headers: { Cookie: bob.cookie, Origin: origin, Upgrade: "websocket" },
    });
    expect(connected.status).toBe(101);
    connected.webSocket!.accept();
    const closed = new Promise<number>((resolve) =>
      connected.webSocket!.addEventListener("close", (event) =>
        resolve(event.code),
      ),
    );
    teamState = "pending";
    expect(
      (await request("/api/session", { headers: { Cookie: bob.cookie } }))
        .status,
    ).toBe(403);
    expect(await closed).toBe(4001);
    teamState = "active";
    teamStatus = 503;
    expect(
      (await request("/api/session", { headers: { Cookie: bob.cookie } }))
        .status,
    ).toBe(502);
    teamStatus = 404;
    for (const path of [
      "/api/github",
      "/api/vault",
      "/api/live/ticket",
      "/api/huddle/join",
      "/api/push",
    ]) {
      expect((await post(path, {}, sessionHeaders(bob))).status).toBe(403);
    }
    expect(
      (await request("/api/session", { headers: { Cookie: owner.cookie } }))
        .status,
    ).toBe(200);
  }, 20_000);
  it("returns sign-in to workspace, private channel and DM links while rejecting arbitrary destinations", async () => {
    await register();
    for (const [query, destination] of [
      ["workspace=" + encodeURIComponent("team/gitrew-chat"), "/w/team"],
      [
        "returnTo=" + encodeURIComponent("/w/team/c/private-channel?thread=m1"),
        "/w/team/c/private-channel?thread=m1",
      ],
      [
        "returnTo=" + encodeURIComponent("/w/team/dm/direct-channel"),
        "/w/team/dm/direct-channel",
      ],
      ["returnTo=" + encodeURIComponent("//evil.test/"), "/w/team"],
      [
        "returnTo=" + encodeURIComponent("/w/team/c/%2f%2fevil.test"),
        "/w/team",
      ],
      ["workspace=" + encodeURIComponent("https://evil.test/"), "/w/team"],
    ]) {
      const start = await request("/api/auth/start?" + query);
      const state = new URL(start.headers.get("location")!).searchParams.get(
        "state",
      );
      const callback = await request(
        `/api/auth/callback?code=x&state=${state}`,
        { headers: { Cookie: cookieValue(start.headers.get("set-cookie")) } },
      );
      expect(callback.status).toBe(303);
      expect(callback.headers.get("location")).toBe(destination);
    }
  });
  it("serves a split-hosted deep link from the public shell without forwarding private headers", async () => {
    const forwarded: {
      url: string;
      cookie: string | null;
      authorization: string | null;
    }[] = [];
    const shellWorker = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        scriptPath: "artifacts/backend-test-worker.mjs",
        compatibilityDate: "2026-10-14",
        compatibilityFlags: ["nodejs_compat"],
        outboundService: async (req) => {
          forwarded.push({
            url: req.url,
            cookie: req.headers.get("Cookie"),
            authorization: req.headers.get("Authorization"),
          });
          return new MFResponse("public app shell", {
            headers: { "Content-Type": "text/html" },
          });
        },
      }),
    );
    try {
      const result = await shellWorker.dispatchFetch(
        origin + "/w/team/c/private-channel?thread=m1",
        {
          headers: {
            Cookie: "private-session",
            Authorization: "private-credential",
          },
        },
      );
      expect(result.status).toBe(200);
      expect(await result.text()).toBe("public app shell");
      expect(result.headers.get("Cache-Control")).toBe("no-store");
      expect(forwarded).toEqual([
        { url: origin + "/200.html", cookie: null, authorization: null },
      ]);
    } finally {
      await shellWorker.dispose();
    }
  });
  it("keeps a new deployment closed until an operator supplies the setup key", async () => {
    expect((await request("/health")).status).toBe(200);
    expect((await request("/api/session")).status).toBe(503);
    expect(
      (
        await post("/api/setup/start", {
          organization: "team",
          setupToken: "wrong",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(
          "/api/setup/start",
          { organization: "team", setupToken: secret },
          { Origin: "https://evil.test" },
        )
      ).status,
    ).toBe(403);
    expect(githubCalls).toHaveLength(0);
  });
  it("registers an owner-controlled App once and encrypts its credentials", async () => {
    const data = await register();
    expect(JSON.parse(data.manifest).public).toBe(false);
    expect(JSON.parse(data.manifest).callback_urls).toEqual([
      origin + "/api/auth/callback",
    ]);
    expect(
      (
        await post("/api/setup/start", {
          organization: "team",
          setupToken: secret,
        })
      ).status,
    ).toBe(409);
    const db = await mf.getD1Database("DB");
    const row = await db
      .prepare("SELECT value FROM settings WHERE key='app'")
      .first<{ value: string }>();
    expect(row?.value).not.toContain(app.client_secret);
    expect(row?.value).not.toContain("PRIVATE KEY");
    expect((await request("/api/config")).status).toBe(200);
    expect(
      JSON.stringify(await (await request("/api/config")).json()),
    ).not.toContain(app.client_secret);
  });
  it("binds manifest registration to its initiating browser and expected GitHub owner", async () => {
    const start = await post("/api/setup/start", {
      organization: "team",
      setupToken: secret,
    });
    const data = (await start.json()) as { action: string };
    const state = new URL(data.action).searchParams.get("state");
    expect(
      (await request(`/api/setup/callback?code=x&state=${state}`)).status,
    ).toBe(400);
    wrongOwner = true;
    expect(
      (
        await request(`/api/setup/callback?code=x&state=${state}`, {
          headers: { Cookie: cookieValue(start.headers.get("set-cookie")) },
        })
      ).status,
    ).toBe(403);
    expect(await store.app()).toBeNull();
  });
  it("uses PKCE, browser-bound single-use state and an HttpOnly session without exposing GitHub tokens", async () => {
    await register();
    const session = await login();
    expect(session.sessionCookie).toContain("HttpOnly");
    expect(session.sessionCookie).toContain("Secure");
    expect(session.sessionCookie).toContain("SameSite=Lax");
    expect(session.sessionCookie).not.toContain("private-user-token");
    const tokenCall = githubCalls.find((c) => c.url.endsWith("/access_token"));
    expect(
      (tokenCall?.body as { code_verifier: string }).code_verifier,
    ).toHaveLength(64);
    const data = await (
      await request("/api/session", { headers: { Cookie: session.cookie } })
    ).text();
    expect(data).not.toContain("private-user-token");
    expect(data).not.toContain("private-refresh-token");
    expect(
      (
        await request(`/api/auth/callback?code=x&state=${session.state}`, {
          headers: { Cookie: session.flowCookie },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/api/session", {
          headers: { Cookie: "__Host-gitrew_session=" + "a".repeat(64) },
        })
      ).status,
    ).toBe(401);
  });
  it("requires both origin and CSRF proof for writes and uses only the acting user's token for GitHub proxying", async () => {
    await register();
    const session = await login();
    const body = {
      path: "/graphql",
      method: "POST",
      body: { query: "query{viewer{login}}" },
    };
    expect(
      (await post("/api/github", body, { Cookie: session.cookie })).status,
    ).toBe(403);
    expect(
      (
        await post("/api/github", body, {
          ...sessionHeaders(session),
          Origin: "https://evil.test",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await post(
          "/api/github",
          { path: "//evil.test" },
          sessionHeaders(session),
        )
      ).status,
    ).toBe(403);
    const result = await post("/api/github", body, sessionHeaders(session));
    expect(result.status).toBe(200);
    expect(
      githubCalls.findLast((c) => c.url.endsWith("/graphql"))?.authorization,
    ).toBe("Bearer private-user-token-1");
    expect(
      (await post("/api/logout", {}, sessionHeaders(session))).status,
    ).toBe(200);
    expect(
      (await request("/api/session", { headers: { Cookie: session.cookie } }))
        .status,
    ).toBe(401);
  });
  it("refreshes expiring credentials server-side and rejects revoked GitHub authorization", async () => {
    await register();
    const session = await login();
    const row = await store.session(session.cookie.split("=")[1]!);
    row.credentials.accessExpires = Date.now() - 1;
    await store.saveSession(row);
    expect(
      (await request("/api/session", { headers: { Cookie: session.cookie } }))
        .status,
    ).toBe(200);
    expect(
      githubCalls.some(
        (c) =>
          (c.body as { grant_type?: string } | undefined)?.grant_type ===
          "refresh_token",
      ),
    ).toBe(true);
    revoked = true;
    expect(
      (await request("/api/session", { headers: { Cookie: session.cookie } }))
        .status,
    ).toBe(401);
    const db = await mf.getD1Database("DB");
    expect(
      await db.prepare("SELECT COUNT(*) AS count FROM sessions").first("count"),
    ).toBe(0);
  });
  it("checks webhook signatures over the exact bytes before revoking sessions", async () => {
    await register();
    const session = await login();
    const body = JSON.stringify(
      { action: "revoked", sender: { id: 1, login: "user1" } },
      null,
      2,
    );
    const call = (signature: string) =>
      request("/api/webhooks", {
        method: "POST",
        headers: {
          "X-GitHub-Event": "github_app_authorization",
          "X-Hub-Signature-256": signature,
        },
        body,
      });
    expect((await call("sha256=wrong")).status).toBe(403);
    expect(
      (await request("/api/session", { headers: { Cookie: session.cookie } }))
        .status,
    ).toBe(200);
    expect(
      (
        await call(
          "sha256=" +
            createHmac("sha256", app.webhook_secret).update(body).digest("hex"),
        )
      ).status,
    ).toBe(200);
    expect(
      (await request("/api/session", { headers: { Cookie: session.cookie } }))
        .status,
    ).toBe(401);
  });
  it("enforces private-channel membership and never sends an installation token to the browser", async () => {
    await register();
    const workspace: Workspace = {
      organization: "team",
      repository: "team/gitrew-chat",
      vault: "team/gitrew-vault",
      installationId: 9,
      nonce: "workspace-nonce",
      ready: true,
      openRegistration: false,
      memberPrivateChannels: false,
    };
    await store.saveWorkspace(workspace);
    const bob = await login(2);
    const allowed = await post(
      "/api/vault",
      {
        organization: "team",
        operation: { op: "read", conversation: "private-channel" },
      },
      sessionHeaders(bob),
    );
    expect(allowed.status).toBe(200);
    const text = await allowed.text();
    expect(text).toContain("Private conversation content");
    expect(text).not.toContain("private-installation-token");
    const carol = await login(3);
    const denied = await post(
      "/api/vault",
      {
        organization: "team",
        operation: { op: "read", conversation: "private-channel" },
      },
      sessionHeaders(carol),
    );
    expect(denied.ok).toBe(false);
    expect(await denied.text()).not.toContain("Private conversation content");
    const unknown = await post(
      "/api/vault",
      { organization: "other", operation: { op: "list" } },
      sessionHeaders(carol),
    );
    expect(unknown.status).toBe(404);
    expect(tokenRevocations).toBe(2);
    const formerOwner = await login(1);
    ownerRole = "member";
    const demoted = await post(
      "/api/vault",
      {
        organization: "team",
        operation: { op: "read", conversation: "private-channel" },
      },
      sessionHeaders(formerOwner),
    );
    expect(demoted.ok).toBe(false);
    expect(await demoted.text()).not.toContain("Private conversation content");
    ownerRole = "outside";
    const removed = await post(
      "/api/vault",
      { organization: "team", operation: { op: "list" } },
      sessionHeaders(formerOwner),
    );
    expect(removed.ok).toBe(false);
  });
  it("grants organization members read access only to the private chat repository", async () => {
    await register();
    const member = await login(2);
    await store.saveWorkspace({
      organization: "team",
      repository: "team/gitrew-chat",
      vault: "team/gitrew-vault",
      installationId: 9,
      nonce: "workspace-nonce",
      ready: true,
      openRegistration: true,
      memberPrivateChannels: true,
    });
    chatReaders = new Set([1]);
    const loaded = await request("/api/session", {
      headers: { Cookie: member.cookie },
    });
    expect(loaded.status).toBe(200);
    expect(await loaded.json()).toMatchObject({
      workspace: { openRegistration: false },
    });
    expect(chatReaders.has(2)).toBe(true);
    expect(
      githubCalls.filter(
        (c) => c.method === "PUT" && c.url.includes("/collaborators/"),
      ),
    ).toMatchObject([
      {
        url: "https://api.github.com/repos/team/gitrew-chat/collaborators/user2",
        authorization: "Bearer private-installation-token",
        body: { permission: "pull" },
      },
    ]);
    expect(
      githubCalls.findLast((c) => c.url.endsWith("/access_tokens"))?.body,
    ).toEqual({
      repositories: ["gitrew-chat"],
      permissions: { administration: "write" },
    });
    expect(tokenRevocations).toBe(1);
    await request("/api/session", { headers: { Cookie: member.cookie } });
    expect(tokenRevocations).toBe(1);
  });
  it("rejects outsiders, pending members and public chat repositories even with legacy open registration", async () => {
    await register();
    const member = await login(2);
    await store.saveWorkspace({
      organization: "team",
      repository: "team/gitrew-chat",
      vault: "team/gitrew-vault",
      installationId: 9,
      nonce: "workspace-nonce",
      ready: true,
      openRegistration: true,
      memberPrivateChannels: true,
    });
    chatReaders = new Set([1]);
    for (const state of ["pending", "outside"]) {
      selfMembershipState = state;
      expect(
        (await request("/api/session", { headers: { Cookie: member.cookie } }))
          .status,
      ).toBe(403);
    }
    expect(chatReaders.has(2)).toBe(false);
    expect(tokenRevocations).toBe(0);
    selfMembershipState = "active";
    chatReaders.add(2);
    chatPrivate = false;
    expect(
      (await request("/api/session", { headers: { Cookie: member.cookie } }))
        .status,
    ).toBe(409);
    membership.openRegistration = true;
    inviteeState = "outside";
    expect(
      (
        await post(
          "/api/vault",
          { organization: "team", operation: { op: "list" } },
          sessionHeaders(member),
        )
      ).status,
    ).toBe(403);
    expect(tokenRevocations).toBe(1);
  });
  it("revokes the scoped installation token if granting chat access fails", async () => {
    await register();
    const member = await login(2);
    await store.saveWorkspace({
      organization: "team",
      repository: "team/gitrew-chat",
      vault: "team/gitrew-vault",
      installationId: 9,
      nonce: "workspace-nonce",
      ready: true,
      openRegistration: false,
      memberPrivateChannels: false,
    });
    chatReaders = new Set([1]);
    failChatGrant = true;
    expect(
      (await request("/api/session", { headers: { Cookie: member.cookie } }))
        .status,
    ).toBe(502);
    expect(chatReaders.has(2)).toBe(false);
    expect(tokenRevocations).toBe(1);
  });
  it("adds an active organization member to a closed workspace without giving them vault access", async () => {
    await register();
    await store.saveWorkspace({
      organization: "team",
      repository: "team/gitrew-chat",
      vault: "team/gitrew-vault",
      installationId: 9,
      nonce: "workspace-nonce",
      ready: true,
      openRegistration: false,
      memberPrivateChannels: false,
    });
    membership.members = [{ id: 1, login: "user1" }];
    const owner = await login(1);
    const bob = await login(2);
    const operation = (
      session: { cookie: string; csrf: string },
      operation: unknown,
    ) =>
      post(
        "/api/vault",
        { organization: "team", operation },
        sessionHeaders(session),
      );
    expect((await operation(bob, { op: "list" })).ok).toBe(false);
    expect((await operation(bob, { op: "join" })).ok).toBe(false);
    for (const state of ["pending", "outside"] as const) {
      inviteeState = state;
      expect(
        (await operation(owner, { op: "invite", login: "user2" })).ok,
      ).toBe(false);
      expect(membership.members.map((member) => member.id)).toEqual([1]);
    }
    inviteeState = "active";
    inviteeIdentity = 999;
    expect((await operation(owner, { op: "invite", login: "user2" })).ok).toBe(
      false,
    );
    inviteeIdentity = 2;
    for (let retry = 0; retry < 2; retry++)
      expect(
        (await operation(owner, { op: "invite", login: "user2" })).status,
      ).toBe(200);
    expect(membership.members.filter((member) => member.id === 2)).toEqual([
      { id: 2, login: "user2" },
    ]);
    expect((await operation(bob, { op: "list" })).status).toBe(200);
    expect(
      (await operation(bob, { op: "read", conversation: "private-channel" }))
        .status,
    ).toBe(200);
    expect((await operation(bob, { op: "invite", login: "user2" })).ok).toBe(
      false,
    );
    expect(
      githubCalls.some(
        (call) =>
          call.method !== "GET" &&
          /collaborators|\/teams\/|\/invitations/.test(call.url),
      ),
    ).toBe(false);
    expect((await operation(owner, { op: "remove", userId: 2 })).status).toBe(
      200,
    );
    expect(
      (await operation(bob, { op: "read", conversation: "private-channel" }))
        .ok,
    ).toBe(false);
    expect(
      (await operation(owner, { op: "invite", login: "user2" })).status,
    ).toBe(200);
    expect(
      (await operation(bob, { op: "read", conversation: "private-channel" }))
        .status,
    ).toBe(200);
  });
  it("provisions custom repositories alongside an existing workspace and keeps names fixed on retries", async () => {
    await register();
    const session = await login();
    const names = {
      organization: "team",
      repositoryName: "custom-test-chat",
      vaultName: "custom-test-vault",
    };
    const create = (body: unknown) =>
      post("/api/workspaces", body, sessionHeaders(session));
    failCustomChannel = true;
    expect((await create(names)).ok).toBe(false);
    const checkpoint = await store.workspace("team");
    expect(checkpoint?.ready).toBe(false);
    expect(checkpoint?.repository).toBe("team/custom-test-chat");
    expect(checkpoint?.vault).toBe("team/custom-test-vault");
    expect(
      (await create({ ...names, vaultName: "custom-test-another" })).status,
    ).toBe(409);
    failCustomChannel = false;
    const resumed = await create(names);
    expect(resumed.status).toBe(200);
    expect(await resumed.json()).toMatchObject({
      workspace: {
        repository: "team/custom-test-chat",
        vault: "team/custom-test-vault",
      },
    });
    expect((await store.workspace("team"))?.nonce).toBe(checkpoint?.nonce);
    expect((await store.workspace("team"))?.ready).toBe(true);
    expect(customRepos.get("custom-test-chat")?.private).toBe(true);
    expect((await store.workspace("team"))?.openRegistration).toBe(false);
    expect(customRepos.get("custom-test-vault")?.private).toBe(true);
    const creates = githubCalls.filter(
      (c) =>
        c.method === "POST" && new URL(c.url).pathname === "/orgs/team/repos",
    );
    expect(creates).toHaveLength(2);
    expect((await create({ organization: "team" })).status).toBe(200);
    expect(
      githubCalls.some((c) => /\/repos\/team\/gitrew-(chat|vault)/.test(c.url)),
    ).toBe(false);
    const token = githubCalls.findLast((c) => c.url.endsWith("/access_tokens"));
    expect(token?.body).toMatchObject({ repositories: ["custom-test-vault"] });
    const loaded = await request("/api/session", {
      headers: { Cookie: session.cookie },
    });
    expect(await loaded.json()).toMatchObject({
      workspace: {
        repository: "team/custom-test-chat",
        vault: "team/custom-test-vault",
      },
    });
  });
  it("validates custom names and preflights both repositories before creating either", async () => {
    await register();
    const session = await login();
    for (const [repositoryName, vaultName] of [
      ["../other", "safe"],
      ["same", "SAME"],
      ["safe", "vault.git"],
      [".", "safe"],
    ]) {
      expect(
        (
          await post(
            "/api/workspaces",
            { organization: "team", repositoryName, vaultName },
            sessionHeaders(session),
          )
        ).status,
      ).toBe(400);
    }
    expect(customRepos.size).toBe(0);
    customRepos.set("custom-test-vault", {
      id: 99,
      private: true,
      description: "unrelated",
      has_discussions: true,
    });
    const conflict = await post(
      "/api/workspaces",
      {
        organization: "team",
        repositoryName: "custom-test-chat",
        vaultName: "custom-test-vault",
      },
      sessionHeaders(session),
    );
    expect(conflict.status).toBe(409);
    expect(
      githubCalls.some(
        (c) => c.method === "POST" && c.url.endsWith("/orgs/team/repos"),
      ),
    ).toBe(false);
    expect(customRepos.has("custom-test-chat")).toBe(false);
  });
  it("refuses unsafe organization base access and preserves unrelated repositories", async () => {
    await register();
    const session = await login();
    basePermission = "read";
    const unsafe = await post(
      "/api/workspaces",
      { organization: "team" },
      sessionHeaders(session),
    );
    expect(unsafe.status).toBe(409);
    expect(await unsafe.text()).toContain("None");
    basePermission = "none";
    const unrelated = await post(
      "/api/workspaces",
      { organization: "team" },
      sessionHeaders(session),
    );
    expect(unrelated.status).toBe(409);
    expect(await unrelated.text()).toContain("unrelated");
    expect(
      githubCalls.filter(
        (c) => c.method === "POST" && c.url.includes("/orgs/team/repos"),
      ),
    ).toHaveLength(0);
  });
});

describe("live conversation access", () => {
  const room = { organization: "team", channel: "general", kind: "public" };
  async function provision() {
    await register();
    await store.saveWorkspace({
      organization: "team",
      repository: "team/gitrew-chat",
      vault: "team/gitrew-vault",
      installationId: 7,
      openRegistration: false,
      memberPrivateChannels: false,
      nonce: "live-test",
      ready: true,
    });
  }
  async function ticket(
    session: Awaited<ReturnType<typeof login>>,
    selected = room,
  ) {
    const result = await post(
      "/api/live/ticket",
      selected,
      sessionHeaders(session),
    );
    return result;
  }
  async function connect(
    session: Awaited<ReturnType<typeof login>>,
    selected = room,
  ) {
    const result = await ticket(session, selected);
    expect(result.status).toBe(200);
    const { ticket: raw } = (await result.json()) as { ticket: string };
    const response = await request(`/api/live/socket?ticket=${raw}`, {
      headers: { Cookie: session.cookie, Origin: origin, Upgrade: "websocket" },
    });
    expect(response.status).toBe(101);
    response.webSocket!.accept();
    return { socket: response.webSocket!, raw };
  }
  it("rejects forged public rooms, private nonparticipants and cross-origin socket upgrades", async () => {
    await provision();
    const carol = await login(3);
    expect((await ticket(carol, { ...room, channel: "outside" })).status).toBe(
      403,
    );
    expect(
      (
        await ticket(carol, {
          ...room,
          channel: "private-channel",
          kind: "private",
        })
      ).status,
    ).toBe(403);
    const result = await ticket(carol);
    const { ticket: raw } = (await result.json()) as { ticket: string };
    expect(
      (
        await request(`/api/live/socket?ticket=${raw}`, {
          headers: {
            Cookie: carol.cookie,
            Origin: "https://evil.test",
            Upgrade: "websocket",
          },
        })
      ).status,
    ).toBe(403);
  });
  it("binds one-use tickets to their session and rechecks private membership before consuming", async () => {
    await provision();
    const bob = await login(2),
      carol = await login(3);
    const result = await ticket(bob);
    const { ticket: raw } = (await result.json()) as { ticket: string };
    expect(
      (
        await request(`/api/live/socket?ticket=${raw}`, {
          headers: {
            Cookie: carol.cookie,
            Origin: origin,
            Upgrade: "websocket",
          },
        })
      ).status,
    ).toBe(403);
    const live = await connect(bob);
    expect(
      (
        await request(`/api/live/socket?ticket=${live.raw}`, {
          headers: { Cookie: bob.cookie, Origin: origin, Upgrade: "websocket" },
        })
      ).status,
    ).toBe(400);
    const pending = await ticket(bob, {
      ...room,
      channel: "private-channel",
      kind: "private",
    });
    expect(pending.status).toBe(200);
    const data = (await pending.json()) as { ticket: string };
    membership.members = membership.members.filter((m) => m.id !== 2);
    expect(
      (
        await request(`/api/live/socket?ticket=${data.ticket}`, {
          headers: { Cookie: bob.cookie, Origin: origin, Upgrade: "websocket" },
        })
      ).ok,
    ).toBe(false);
    live.socket.close();
  });
  it("allows concurrent authorized private refreshes without weakening participant checks", async () => {
    await provision();
    const alice = await login(1),
      bob = await login(2),
      carol = await login(3);
    const read = (session: Awaited<ReturnType<typeof login>>) =>
      post(
        "/api/vault",
        {
          organization: "team",
          operation: { op: "read", conversation: "private-channel" },
        },
        sessionHeaders(session),
      );
    const results = await Promise.all([read(alice), read(bob), read(carol)]);
    expect(results[0].status).toBe(200);
    expect(results[1].status).toBe(200);
    expect(results[2].ok).toBe(false);
    expect(await results[2].text()).not.toContain(
      "Private conversation content",
    );
  });
  it("authorizes huddles, scopes participant creation and protects lease cleanup", async () => {
    await provision();
    const bob = await login(2),
      carol = await login(3);
    const privateRoom = {
      ...room,
      channel: "private-channel",
      kind: "private",
    };
    expect(
      (
        await post(
          "/api/huddle/join",
          { room: privateRoom },
          sessionHeaders(carol),
        )
      ).status,
    ).toBe(403);
    const joined = await post(
      "/api/huddle/join",
      { room: privateRoom },
      sessionHeaders(bob),
    );
    expect(joined.status).toBe(200);
    const data = (await joined.json()) as { lease: string };
    expect(data).toMatchObject({
      provider: "realtimekit",
      token: "test-only-participant-token",
    });
    const participant = githubCalls.find(
      (c) => c.url.endsWith("/participants") && c.method === "POST",
    );
    expect(participant?.body).toMatchObject({
      name: "user2",
      preset_name: "voice",
    });
    expect(
      (
        await post(
          "/api/huddle/leave",
          { room, lease: data.lease },
          sessionHeaders(carol),
        )
      ).status,
    ).toBe(200);
    expect(
      githubCalls.some((c) => c.url.endsWith("/active-session/kick")),
    ).toBe(false);
    expect(
      (
        await post(
          "/api/huddle/leave",
          { room: privateRoom, lease: data.lease },
          sessionHeaders(bob),
        )
      ).status,
    ).toBe(200);
    expect(
      githubCalls.some((c) => c.url.endsWith("/active-session/kick")),
    ).toBe(true);
    expect(
      (
        await post(
          "/api/huddle/heartbeat",
          { room: privateRoom, lease: data.lease },
          sessionHeaders(bob),
        )
      ).status,
    ).toBe(410);
  });
  it("keeps typing within a room, uses the server identity, and closes on sign-out", async () => {
    await provision();
    const alice = await login(1),
      bob = await login(2),
      carol = await login(3);
    const a = await connect(alice, {
        ...room,
        channel: "private-channel",
        kind: "private",
      }),
      b = await connect(bob, {
        ...room,
        channel: "private-channel",
        kind: "private",
      }),
      c = await connect(carol);
    const leaked: unknown[] = [];
    c.socket.addEventListener("message", (e) => {
      const data = JSON.parse(String(e.data));
      if (data.type === "typing") leaked.push(data);
    });
    const typing = new Promise<Record<string, unknown>>((resolve) =>
      a.socket.addEventListener("message", (e) => {
        const data = JSON.parse(String(e.data));
        if (data.type === "typing") resolve(data);
      }),
    );
    b.socket.send(
      JSON.stringify({
        type: "typing",
        active: true,
        userId: 3,
        channel: "general",
      }),
    );
    expect(await typing).toMatchObject({
      type: "typing",
      userId: 2,
      login: "user2",
    });
    expect(leaked).toEqual([]);
    const closed = new Promise<number>((resolve) =>
      b.socket.addEventListener("close", (e) => resolve(e.code)),
    );
    expect((await post("/api/logout", {}, sessionHeaders(bob))).status).toBe(
      200,
    );
    expect(await closed).toBe(4001);
    a.socket.close();
    c.socket.close();
  });
});
