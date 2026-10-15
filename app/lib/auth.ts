import { pendingOAuthSchema, sessionSchema } from "../../shared/auth";

export const SESSION_KEY = "gitrew:github-session:v1";
export const OAUTH_KEY = "gitrew:oauth-pending:v1";

function randomString(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function createAuthorization(
  clientId: string,
  redirectUri: string,
  storage: Storage,
): Promise<string> {
  const state = randomString();
  const verifier = randomString(48);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  storage.setItem(
    OAUTH_KEY,
    JSON.stringify({ state, verifier, createdAt: Date.now() }),
  );
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.href;
}

export function consumeCallback(
  url: URL,
  storage: Storage,
): { code: string; verifier: string } | null {
  if (!url.searchParams.has("code") && !url.searchParams.has("error"))
    return null;
  const raw = storage.getItem(OAUTH_KEY);
  storage.removeItem(OAUTH_KEY);
  const pending = pendingOAuthSchema.safeParse(safeJson(raw));
  if (
    !pending.success ||
    pending.data.state !== url.searchParams.get("state") ||
    Date.now() - pending.data.createdAt > 10 * 60_000 ||
    pending.data.createdAt > Date.now()
  ) {
    throw new Error(
      "This sign-in request expired or could not be verified. Please sign in again.",
    );
  }
  if (url.searchParams.has("error"))
    throw new Error("GitHub sign-in was cancelled. You can try again.");
  const code = url.searchParams.get("code");
  if (!code)
    throw new Error("GitHub did not complete sign-in. Please try again.");
  return { code, verifier: pending.data.verifier };
}

export function readSession(storage: Storage) {
  const result = sessionSchema.safeParse(
    safeJson(storage.getItem(SESSION_KEY)),
  );
  if (!result.success || result.data.expiresAt <= Date.now()) {
    storage.removeItem(SESSION_KEY);
    return null;
  }
  return result.data;
}

function safeJson(raw: string | null): unknown {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function brokerAddress(value: string): URL {
  if (!value)
    throw new Error(
      "GitHub sign-in is not configured on this deployment yet. You can explore the local preview.",
    );
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  ) {
    throw new Error("The GitHub sign-in service address is invalid.");
  }
  return url;
}
