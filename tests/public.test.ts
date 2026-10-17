import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  Miniflare,
  convertV4MiniflareOptions,
  Response as MFResponse,
} from "miniflare";
import { build } from "esbuild";

const origin = "https://gitrew.test";
let mf: Miniflare;
let upstreamCalls: { query: string; variables: unknown }[] = [];
let upstreamStatus = 200;
let privateRepo = false;
let missingOwner = false;

const json = (value: unknown, status = 200) =>
  new MFResponse(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function graphqlResponse(query: string, variables: Record<string, unknown>) {
  if (query.includes("PublicRepos")) {
    if (missingOwner) return { data: { repositoryOwner: null } };
    return {
      data: {
        repositoryOwner: {
          login: "acme",
          __typename: "Organization",
          repositories: {
            nodes: [
              {
                name: "widget",
                description: "Widgets",
                stargazerCount: 42,
                hasDiscussionsEnabled: true,
              },
            ],
            pageInfo: { hasNextPage: true, endCursor: "repos-cursor-1" },
          },
        },
      },
    };
  }
  if (query.includes("PublicRepo(")) {
    if (missingOwner) return { data: { repository: null } };
    return {
      data: {
        repository: {
          isPrivate: privateRepo,
          description: "Widgets",
          stargazerCount: 42,
          hasDiscussionsEnabled: true,
          url: "https://github.com/acme/widget",
        },
      },
    };
  }
  if (query.includes("PublicDiscussions")) {
    return {
      data: {
        repository: {
          isPrivate: privateRepo,
          discussions: {
            nodes: [
              {
                id: "D_1",
                title: "#general",
                body: "Hello",
                url: "https://github.com/acme/widget/discussions/1",
                createdAt: "2026-10-01T00:00:00Z",
                category: { name: "Announcements", emoji: "📣" },
                comments: { totalCount: 2 },
              },
            ],
            pageInfo: { hasNextPage: true, endCursor: "disc-cursor-1" },
          },
        },
      },
    };
  }
  return {
    data: {
      node: {
        repository: { isPrivate: privateRepo },
        comments: {
          nodes: [
            {
              id: "C_1",
              body: "First",
              createdAt: "2026-10-01T00:00:00Z",
              updatedAt: "2026-10-01T00:00:00Z",
              url: "https://github.com/acme/widget/discussions/1#1",
              author: { login: "robin" },
              reactionGroups: [
                { content: "THUMBS_UP", users: { totalCount: 2 } },
              ],
              replies: {
                nodes: [
                  {
                    id: "R_1",
                    body: "Reply",
                    createdAt: "2026-10-01T00:00:00Z",
                    updatedAt: "2026-10-01T00:00:00Z",
                    url: "https://github.com/acme/widget/discussions/1#r1",
                    author: { login: "sam" },
                  },
                ],
              },
            },
          ],
          pageInfo: { hasPreviousPage: true, startCursor: "history-cursor-0" },
        },
      },
    },
  };
}

async function start(extraBindings: Record<string, string> = {}) {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: "artifacts/backend-test-worker.mjs",
      compatibilityDate: "2026-10-14",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      bindings: {
        PUBLIC_MODE: "true",
        PUBLIC_APP: "false",
        SANDBOX_ORGANIZATION: "",
        PUBLIC_GITHUB_TOKEN: "test-only-public-token",
        ...extraBindings,
      },
      serviceBindings: { ASSETS: () => new MFResponse("client") },
      outboundService: async (req) => {
        const body = (await req.json()) as {
          query: string;
          variables: Record<string, unknown>;
        };
        upstreamCalls.push({ query: body.query, variables: body.variables });
        if (upstreamStatus !== 200)
          return json({ message: "limited" }, upstreamStatus);
        return json(graphqlResponse(body.query, body.variables));
      },
    }),
  );
}

const get = (path: string, ip = "127.0.0.1") =>
  mf.dispatchFetch(origin + path, {
    redirect: "manual",
    headers: { "CF-Connecting-IP": ip },
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
  upstreamCalls = [];
  upstreamStatus = 200;
  privateRepo = false;
  missingOwner = false;
  await start();
});

afterEach(async () => {
  await mf?.dispose();
});

describe("public browsing", () => {
  it("serves one cached page of an owner's public repositories", async () => {
    const first = await get("/api/public/github/acme");
    expect(first.status).toBe(200);
    const body = (await first.json()) as {
      login: string;
      repositories: { name: string }[];
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
    expect(body.login).toBe("acme");
    expect(body.repositories.map((repo) => repo.name)).toEqual(["widget"]);
    expect(body.pageInfo).toEqual({
      hasNextPage: true,
      endCursor: "repos-cursor-1",
    });
    expect(first.headers.get("X-Gitrew-Cache")).toBe("miss");
    expect(upstreamCalls).toHaveLength(1);
    const second = await get("/api/public/github/acme");
    expect(second.headers.get("X-Gitrew-Cache")).toBe("hit");
    expect(upstreamCalls).toHaveLength(1);
  });

  it("returns 404 for unknown owners and private repositories alike", async () => {
    missingOwner = true;
    expect((await get("/api/public/github/ghost")).status).toBe(404);
    expect((await get("/api/public/github/ghost/widget")).status).toBe(404);
    privateRepo = true;
    missingOwner = false;
    expect((await get("/api/public/github/acme/widget")).status).toBe(404);
    expect((await get("/api/public/github/acme/widget/discussions")).status)
      .toBe(404);
    expect(
      (await get("/api/public/github/discussions/D_1/comments")).status,
    ).toBe(404);
  });

  it("pages discussions and comments one upstream request at a time", async () => {
    const page = (await (
      await get("/api/public/github/acme/widget/discussions")
    ).json()) as {
      discussions: { id: string; category?: { name: string } }[];
      pageInfo: { hasNextPage: boolean };
    };
    expect(page.discussions.map((d) => d.id)).toEqual(["D_1"]);
    expect(page.discussions[0]?.category?.name).toBe("Announcements");
    expect(page.pageInfo.hasNextPage).toBe(true);
    expect(upstreamCalls).toHaveLength(1);
    await get("/api/public/github/acme/widget/discussions?after=disc-cursor-1");
    expect(upstreamCalls).toHaveLength(2);
    const thread = (await (
      await get("/api/public/github/discussions/D_1/comments")
    ).json()) as {
      comments: {
        id: string;
        reactions: Array<{ emoji: string; count: number }>;
        replies: { nodes: { id: string }[] };
      }[];
      pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
    };
    expect(thread.comments[0]!.reactions).toEqual([
      { emoji: "👍", count: 2 },
    ]);
    expect(thread.comments[0]!.replies.nodes.map((r) => r.id)).toEqual(["R_1"]);
    expect(thread.pageInfo).toEqual({
      hasPreviousPage: true,
      startCursor: "history-cursor-0",
    });
    expect(upstreamCalls).toHaveLength(3);
    // Walking history re-queries upstream with before, never after.
    await get("/api/public/github/discussions/D_1/comments?before=history-cursor-0");
    expect(upstreamCalls).toHaveLength(4);
    expect((await get(`/api/public/github/discussions/D_1/comments?before=!!`)).status).toBe(400);
    expect(
      (
        await get(
          "/api/public/github/discussions/D_1/comments?before=history-cursor-0&after=oops",
        )
      ).status,
    ).toBe(400);
    expect(upstreamCalls).toHaveLength(4);
  });

  it("rejects invalid cursors and unknown paths", async () => {
    expect(
      (await get("/api/public/github/acme/widget/discussions?after=!!")).status,
    ).toBe(400);
    // GitHub logins never contain underscores.
    expect((await get("/api/public/github/ACME_OK/widget")).status).toBe(404);
    expect((await get("/api/public/github/nope!")).status).toBe(404);
    expect((await get("/api/public/github/acme/widget/other")).status).toBe(
      404,
    );
  });

  it("enforces a per-visitor request budget", async () => {
    for (let i = 0; i < 60; i++)
      expect((await get("/api/public/github/acme")).status).toBe(200);
    const limited = await get("/api/public/github/acme");
    expect(limited.status).toBe(429);
    // Another visitor still has budget.
    expect((await get("/api/public/github/acme", "10.0.0.2")).status).toBe(
      200,
    );
  });

  it("maps upstream rate limits and missing configuration", async () => {
    upstreamStatus = 429;
    expect((await get("/api/public/github/acme")).status).toBe(429);
    upstreamStatus = 401;
    await mf.dispose();
    await start();
    expect((await get("/api/public/github/acme")).status).toBe(503);
    await mf.dispose();
    await start({ PUBLIC_GITHUB_TOKEN: "" });
    expect((await get("/api/public/github/acme")).status).toBe(503);
  });

  it("keeps every other API path closed in public mode", async () => {
    for (const path of ["/api/config", "/api/session", "/api/github"]) {
      const response = await mf.dispatchFetch(origin + path, {
        redirect: "manual",
      });
      expect(response.status).toBe(404);
    }
  });

  it("routes public pages to the app shell", async () => {
    for (const path of ["/github/", "/github/acme", "/github/acme/widget"]) {
      const response = await mf.dispatchFetch(origin + path, {
        redirect: "manual",
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("client");
    }
  });
});
