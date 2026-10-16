import { Buffer } from "node:buffer";
import { z } from "zod";
import { boundedJson, HttpError } from "./security";
import { requireTeamAccess } from "./access";
import {
  type App,
  type Credentials,
  type Session,
  type BackendStore,
} from "./store";

export const actorSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
});
const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("bearer"),
  expires_in: z.number().int().positive().max(28800),
  refresh_token: z.string().optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
});
export async function githubFetch(
  url: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const endpoint = new URL(
    typeof url === "string" ? url : url instanceof URL ? url.href : url.url,
  );
  if (
    !["https://api.github.com", "https://github.com"].includes(endpoint.origin)
  )
    throw new HttpError(400, "Invalid GitHub endpoint.");
  const headers = new Headers(init?.headers);
  headers.set("User-Agent", "Gitrew");
  headers.set("X-GitHub-Api-Version", "2026-03-10");
  const response = await fetch(endpoint, {
    ...init,
    headers,
    redirect: "manual",
    signal: init?.signal || AbortSignal.timeout(20_000),
  });
  if (response.status >= 300 && response.status < 400)
    throw new HttpError(
      502,
      "GitHub unexpectedly redirected this API request.",
    );
  const body =
    response.status === 204 ? null : await boundedJson(response, 2_000_000);
  const outgoing = new Headers({ "Content-Type": "application/json" });
  for (const name of [
    "retry-after",
    "x-ratelimit-reset",
    "x-ratelimit-remaining",
  ]) {
    const value = response.headers.get(name);
    if (value) outgoing.set(name, value);
  }
  return new Response(body === null ? null : JSON.stringify(body), {
    status: response.status,
    headers: outgoing,
  });
}
export class GitHub {
  constructor(private token: string) {}
  async response(path: string, method = "GET", body?: unknown) {
    if (
      !path.startsWith("/") ||
      path.startsWith("//") ||
      path.includes("\\") ||
      new URL(path, "https://api.github.com").origin !==
        "https://api.github.com"
    )
      throw new HttpError(400, "Invalid GitHub API path.");
    return githubFetch("https://api.github.com" + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  async api<T>(
    path: string,
    validator: z.ZodType<T>,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const response = await this.response(path, method, body);
    if (!response.ok)
      throw new HttpError(
        response.status === 401
          ? 401
          : response.status === 404
            ? 404
            : response.status === 409
              ? 409
              : 502,
        `GitHub could not complete this operation (${response.status}). Check the App installation and permissions.`,
      );
    return validator.parse(
      response.status === 204 ? null : await response.json(),
    );
  }
}
export async function oauthToken(
  app: App,
  input: Record<string, string>,
): Promise<Credentials> {
  const response = await githubFetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: app.client_id,
        client_secret: app.client_secret,
        ...input,
      }),
    },
  );
  const result = tokenSchema.safeParse(await response.json());
  if (!response.ok || !result.success)
    throw new HttpError(
      401,
      "GitHub authorization expired or was rejected. Sign in again.",
    );
  return {
    accessToken: result.data.access_token,
    accessExpires: Date.now() + result.data.expires_in * 1000,
    refreshToken: result.data.refresh_token,
    refreshExpires: result.data.refresh_token_expires_in
      ? Date.now() + result.data.refresh_token_expires_in * 1000
      : undefined,
  };
}
export async function identified(
  store: BackendStore,
  session: Session,
  app: App,
) {
  if (session.credentials.accessExpires < Date.now() + 60_000) {
    await store.locked("refresh:" + session.id, async () => {
      session.credentials = await store.reloadCredentials(session.id);
      if (session.credentials.accessExpires > Date.now() + 60_000) return;
      if (
        !session.credentials.refreshToken ||
        !session.credentials.refreshExpires ||
        session.credentials.refreshExpires < Date.now()
      )
        throw new HttpError(401, "Your session expired. Sign in again.");
      session.credentials = await oauthToken(app, {
        grant_type: "refresh_token",
        refresh_token: session.credentials.refreshToken,
      });
      await store.saveSession(session);
    });
  }
  const api = new GitHub(session.credentials.accessToken);
  const actor = await api.api("/user", actorSchema);
  if (actor.id !== session.userId)
    throw new HttpError(401, "This session could not be verified.");
  return { api, actor };
}
export async function authenticated(
  store: BackendStore,
  session: Session,
  app: App,
  organization = app.owner.login,
  allowedTeam = app.allowedTeam,
) {
  const identity = await identified(store, session, app);
  await requireTeamAccess(
    identity.api,
    app,
    identity.actor.login,
    organization,
    allowedTeam,
  );
  return identity;
}
