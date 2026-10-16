// Anonymous public browsing of GitHub content for the hosted product site.
// Read-only by construction: every handler issues exactly one upstream
// request for a single page, serves confirmed-public content only, and never
// accepts credentials. Responses are cached briefly and bounded per visitor
// so opening a space cannot turn into indexing GitHub.
import { z } from "zod";
import { boundedJson, HttpError, json } from "./security";
import { githubFetch } from "./github";

const ownerPattern = /^[a-z\d](?:[a-z\d-]{0,38})$/i;
const repoPattern = /^[\w.-]{1,100}$/;
const cursorPattern = /^[A-Za-z0-9+/=_-]{1,512}$/;

const PAGE = { repos: 30, discussions: 25, comments: 30, replies: 10 };
const TTL = { meta: 300_000, list: 90_000 };
const BUDGET_MAX = 60;
const BUDGET_WINDOW = 60_000;

export interface PublicEnv {
  DB?: D1Database;
  PUBLIC_GITHUB_TOKEN?: string;
}

const pageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});
type PageInfo = z.infer<typeof pageInfoSchema>;

const graphqlEnvelope = z.object({
  data: z.unknown().optional(),
  errors: z
    .array(z.object({ type: z.string().optional(), message: z.string() }))
    .optional(),
});

export async function ensurePublicTables(db: D1Database) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS public_cache (key TEXT PRIMARY KEY, body TEXT NOT NULL, expires_at INTEGER NOT NULL);
     CREATE TABLE IF NOT EXISTS public_budget (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);`,
  );
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    request.headers.get("cf-connecting-ip") ||
    (forwarded ? forwarded.split(",")[0]!.trim() : "") ||
    "unknown"
  ).slice(0, 128);
}

async function checkBudget(db: D1Database, ip: string) {
  const key = `ip:${ip}`;
  const now = Date.now();
  const row = await db
    .prepare("SELECT window_start, count FROM public_budget WHERE key=?")
    .bind(key)
    .first<{ window_start: number; count: number }>();
  if (!row || row.window_start + BUDGET_WINDOW <= now) {
    await db
      .prepare(
        "INSERT INTO public_budget(key,window_start,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window_start=?,count=1",
      )
      .bind(key, now, now)
      .run();
    return;
  }
  if (row.count >= BUDGET_MAX) {
    const retryAfter = Math.max(
      1,
      Math.ceil((row.window_start + BUDGET_WINDOW - now) / 1000),
    );
    throw new HttpError(429, "Too many public requests. Try again shortly.");
  }
  await db
    .prepare("UPDATE public_budget SET count=count+1 WHERE key=?")
    .bind(key)
    .run();
}

async function cached<T>(
  db: D1Database,
  key: string,
  ttl: number,
  loader: () => Promise<T>,
): Promise<{ data: T; hit: boolean }> {
  const now = Date.now();
  const row = await db
    .prepare("SELECT body FROM public_cache WHERE key=? AND expires_at>?")
    .bind(key, now)
    .first<{ body: string }>();
  if (row) return { data: JSON.parse(row.body) as T, hit: true };
  const data = await loader();
  await db.batch([
    db.prepare("DELETE FROM public_cache WHERE expires_at<=?").bind(now),
    db
      .prepare(
        "INSERT INTO public_cache(key,body,expires_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET body=?,expires_at=?",
      )
      .bind(key, JSON.stringify(data), now + ttl, JSON.stringify(data), now + ttl),
  ]);
  return { data, hit: false };
}

async function upstreamGraphQL(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ data: unknown; rateLimited: boolean }> {
  const response = await githubFetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    if (response.status === 401)
      throw new HttpError(503, "Public browsing is not configured.");
    if (response.status === 403 || response.status === 429)
      throw new HttpError(
        429,
        "GitHub is rate-limiting public browsing. Try again shortly.",
      );
    throw new HttpError(502, "GitHub could not complete this request.");
  }
  const parsed = graphqlEnvelope.parse(await response.json());
  if (parsed.errors?.length || !parsed.data) {
    if (parsed.errors?.some((error) => error.type === "RATE_LIMITED"))
      throw new HttpError(
        429,
        "GitHub is rate-limiting public browsing. Try again shortly.",
      );
    if (parsed.errors?.some((error) => error.type === "NOT_FOUND"))
      throw new HttpError(404, "This GitHub page does not exist.");
    throw new HttpError(502, "GitHub could not complete this request.");
  }
  return { data: parsed.data, rateLimited: false };
}

const ownerSchema = z.object({
  repositoryOwner: z
    .object({
      login: z.string(),
      __typename: z.string(),
      repositories: z.object({
        nodes: z.array(
          z.object({
            name: z.string(),
            description: z.string().nullable(),
            stargazerCount: z.number(),
            hasDiscussionsEnabled: z.boolean(),
          }),
        ),
        pageInfo: pageInfoSchema,
      }),
    })
    .nullable(),
});

const repoSchema = z.object({
  repository: z
    .object({
      isPrivate: z.boolean(),
      description: z.string().nullable(),
      stargazerCount: z.number(),
      hasDiscussionsEnabled: z.boolean(),
      url: z.string(),
    })
    .nullable(),
});

const discussionsSchema = z.object({
  repository: z
    .object({
      isPrivate: z.boolean(),
      discussions: z.object({
        nodes: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            body: z.string(),
            url: z.string(),
            createdAt: z.string(),
            comments: z.object({ totalCount: z.number() }),
          }),
        ),
        pageInfo: pageInfoSchema,
      }),
    })
    .nullable(),
});

const commentSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  url: z.string(),
  author: z.object({ login: z.string() }).nullable(),
});
const commentsSchema = z.object({
  node: z
    .object({
      repository: z.object({ isPrivate: z.boolean() }),
      comments: z.object({
        nodes: z.array(
          commentSchema.extend({
            replies: z.object({
              nodes: z.array(commentSchema),
              pageInfo: pageInfoSchema,
            }),
          }),
        ),
        pageInfo: pageInfoSchema,
      }),
    })
    .nullable(),
});

function excerpt(body: string, limit: number): string {
  return body.length > limit ? body.slice(0, limit) + "…" : body;
}

async function publicOwner(token: string, owner: string, after: string | null) {
  if (!ownerPattern.test(owner)) throw new HttpError(404, "Unknown owner.");
  if (after !== null && !cursorPattern.test(after))
    throw new HttpError(400, "Invalid page cursor.");
  const { data } = await upstreamGraphQL(
    token,
    `query PublicRepos($owner: String!, $after: String) {
      repositoryOwner(login: $owner) { login __typename
        repositories(first: ${PAGE.repos}, after: $after, privacy: PUBLIC, orderBy: {field: STARGAZERS, direction: DESC}) {
          nodes { name description stargazerCount hasDiscussionsEnabled }
          pageInfo { hasNextPage endCursor }
        } }
    }`,
    { owner, after },
  );
  const parsed = ownerSchema.parse(data);
  if (!parsed.repositoryOwner) throw new HttpError(404, "Unknown owner.");
  return {
    login: parsed.repositoryOwner.login,
    type:
      parsed.repositoryOwner.__typename === "Organization"
        ? "organization"
        : "user",
    repositories: parsed.repositoryOwner.repositories.nodes,
    pageInfo: parsed.repositoryOwner.repositories.pageInfo,
  };
}

async function publicRepo(token: string, owner: string, name: string) {
  if (!ownerPattern.test(owner) || !repoPattern.test(name))
    throw new HttpError(404, "Unknown repository.");
  const { data } = await upstreamGraphQL(
    token,
    `query PublicRepo($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        isPrivate description stargazerCount hasDiscussionsEnabled url
      }
    }`,
    { owner, name },
  );
  const parsed = repoSchema.parse(data);
  // Private and missing repositories are indistinguishable by design.
  if (!parsed.repository || parsed.repository.isPrivate)
    throw new HttpError(404, "Unknown repository.");
  return parsed.repository;
}

async function publicDiscussions(
  token: string,
  owner: string,
  name: string,
  after: string | null,
) {
  if (!ownerPattern.test(owner) || !repoPattern.test(name))
    throw new HttpError(404, "Unknown repository.");
  if (after !== null && !cursorPattern.test(after))
    throw new HttpError(400, "Invalid page cursor.");
  const { data } = await upstreamGraphQL(
    token,
    `query PublicDiscussions($owner: String!, $name: String!, $after: String) {
      repository(owner: $owner, name: $name) { isPrivate
        discussions(first: ${PAGE.discussions}, after: $after) {
          nodes { id title body url createdAt comments { totalCount } }
          pageInfo { hasNextPage endCursor }
        } }
    }`,
    { owner, name, after },
  );
  const parsed = discussionsSchema.parse(data);
  if (!parsed.repository || parsed.repository.isPrivate)
    throw new HttpError(404, "Unknown repository.");
  return {
    discussions: parsed.repository.discussions.nodes.map((discussion) => ({
      ...discussion,
      body: excerpt(discussion.body, 4000),
    })),
    pageInfo: parsed.repository.discussions.pageInfo,
  };
}

async function publicComments(token: string, id: string, after: string | null) {
  if (!z.string().min(1).max(256).safeParse(id).success)
    throw new HttpError(404, "Unknown conversation.");
  if (after !== null && !cursorPattern.test(after))
    throw new HttpError(400, "Invalid page cursor.");
  const { data } = await upstreamGraphQL(
    token,
    `query PublicComments($id: ID!, $after: String) {
      node(id: $id) { ... on Discussion { repository { isPrivate }
        comments(first: ${PAGE.comments}, after: $after) {
          nodes { id body createdAt updatedAt url author { login }
            replies(first: ${PAGE.replies}) {
              nodes { id body createdAt updatedAt url author { login } }
              pageInfo { hasNextPage endCursor } } }
          pageInfo { hasNextPage endCursor } } } }
    }`,
    { id, after },
  );
  const parsed = commentsSchema.parse(data);
  if (!parsed.node || parsed.node.repository.isPrivate)
    throw new HttpError(404, "Unknown conversation.");
  return {
    comments: parsed.node.comments.nodes.map((comment) => ({
      ...comment,
      body: excerpt(comment.body, 8000),
      replies: {
        ...comment.replies,
        nodes: comment.replies.nodes.map((reply) => ({
          ...reply,
          body: excerpt(reply.body, 8000),
        })),
      },
    })),
    pageInfo: parsed.node.comments.pageInfo,
  };
}

/** Anonymous GET routes under /api/public/. Returns null for other paths. */
export async function handlePublic(
  request: Request,
  url: URL,
  env: PublicEnv,
): Promise<Response | null> {
  if (request.method !== "GET") return null;
  const space = /^\/api\/public\/github\/([^/]+)(?:\/([^/]+)(?:\/(discussions))?)?$/.exec(
    url.pathname,
  );
  const thread = /^\/api\/public\/github\/discussions\/([^/]+)\/comments$/.exec(
    url.pathname,
  );
  if (!space && !thread) return null;
  if (!env.DB || !env.PUBLIC_GITHUB_TOKEN)
    throw new HttpError(503, "Public browsing is not configured.");
  const db = env.DB;
  const token = env.PUBLIC_GITHUB_TOKEN;
  await ensurePublicTables(db);
  await checkBudget(db, clientIp(request));
  const after = url.searchParams.get("after");
  const key = `GET ${url.pathname}${after ? `?after=${after}` : ""}`;
  const load = async () => {
    if (thread) {
      return publicComments(
        token,
        decodeURIComponent(thread[1]!),
        after,
      );
    }
    const [, owner, name, section] = space!;
    if (!name) return publicOwner(token, owner!, after);
    if (!section) return publicRepo(token, owner!, name);
    return publicDiscussions(token, owner!, name, after);
  };
  const ttl = space?.[2] && !space[3] ? TTL.meta : TTL.list;
  const { data, hit } = await cached(db, key, ttl, load);
  return json(data, 200, { "X-Gitrew-Cache": hit ? "hit" : "miss" });
}
