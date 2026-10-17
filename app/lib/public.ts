// Anonymous public browsing transport. Same-origin reads only, no
// credentials, single page per call — the server enforces budgets.
export interface PublicPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}
export interface PublicRepository {
  name: string;
  description: string | null;
  stargazerCount: number;
  hasDiscussionsEnabled: boolean;
}
export interface PublicOwner {
  login: string;
  type: string;
  repositories: PublicRepository[];
  pageInfo: PublicPageInfo;
}
export interface PublicRepoMeta {
  description: string | null;
  stargazerCount: number;
  hasDiscussionsEnabled: boolean;
  url: string;
}
export interface PublicDiscussion {
  id: string;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  category?: { name: string; emoji: string } | null;
  comments: { totalCount: number };
}
export interface PublicComment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  author: { login: string } | null;
  reactions?: Array<{ emoji: string; count: number }>;
}
export interface PublicThreadComment extends PublicComment {
  replies: { nodes: PublicComment[]; pageInfo?: PublicPageInfo };
}

export class PublicError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
  ) {
    super(message);
  }
}

async function publicGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: { Accept: "application/json" },
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: unknown;
  };
  if (!response.ok) {
    if (response.status === 404)
      throw new PublicError("This GitHub page does not exist.", 404);
    if (response.status === 429)
      throw new PublicError(
        "Too many requests right now. Wait a moment and try again.",
        429,
      );
    if (response.status === 503)
      throw new PublicError("Public browsing is not available yet.", 503);
    throw new PublicError(
      typeof body.error === "string"
        ? body.error
        : "Gitrew could not load this page.",
      response.status,
    );
  }
  return body as T;
}

const query = (after: string | null) =>
  after ? `?after=${encodeURIComponent(after)}` : "";

export function publicOwner(owner: string, after: string | null = null) {
  return publicGet<PublicOwner>(
    `/api/public/github/${encodeURIComponent(owner)}${query(after)}`,
  );
}
export function publicRepoMeta(owner: string, repo: string) {
  return publicGet<PublicRepoMeta>(
    `/api/public/github/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
  );
}
export function publicDiscussions(
  owner: string,
  repo: string,
  after: string | null = null,
) {
  return publicGet<{ discussions: PublicDiscussion[]; pageInfo: PublicPageInfo }>(
    `/api/public/github/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/discussions${query(after)}`,
  );
}
export function publicComments(id: string, before: string | null = null) {
  return publicGet<{
    comments: PublicThreadComment[];
    pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
  }>(
    `/api/public/github/discussions/${encodeURIComponent(id)}/comments${
      before ? `?before=${encodeURIComponent(before)}` : ""
    }`,
  );
}
