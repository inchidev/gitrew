// This marker is not a GitHub credential. Authority comes from the HttpOnly
// server cookie; the suffix is the session's CSRF proof for same-origin writes.
const PREFIX = "gitrew-backend:";
export const backendToken = (csrf: string) => PREFIX + csrf;
export const isBackendToken = (token: string) => token.startsWith(PREFIX);
export async function backendResponse(
  path: string,
  token = "",
  body?: unknown,
  signal?: AbortSignal,
) {
  return fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(isBackendToken(token)
        ? { "X-Gitrew-CSRF": token.slice(PREFIX.length) }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
}
export async function backendJson<T = unknown>(
  path: string,
  token = "",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await backendResponse(path, token, body, signal);
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Gitrew could not complete this request.",
    );
  return result;
}
export function githubFetch(
  path: string,
  token: string,
  init: RequestInit = {},
) {
  if (isBackendToken(token))
    return backendResponse(
      "/api/github",
      token,
      {
        path,
        method: init.method || "GET",
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      },
      init.signal || undefined,
    );
  return fetch("https://api.github.com" + path, {
    ...init,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      ...init.headers,
    },
  });
}
