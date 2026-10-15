import { appReturnTo, legacyWorkspacePath, workspacePath } from "../shared/routes";
import { Buffer } from "node:buffer";
import { repositoryNameSchema } from "../shared/workspace";
import { z } from "zod";
import { appSchema, Store, type App, type BackendStore } from "./store";
import {
  authenticated,
  GitHub,
  githubFetch,
  oauthToken,
  actorSchema,
} from "./github";
import {
  boundedBytes,
  boundedJson,
  cookie,
  equal,
  HttpError,
  json,
  random,
  redirect,
  sameOrigin,
  setCookie,
} from "./security";
import {
  ensureWorkspaceAccess,
  organizationSchema,
  provisionWorkspace,
  vaultOperation,
  workspaceConfig,
} from "./workspace";

const SESSION = "__Host-gitrew_session",
  FLOW = "__Host-gitrew_flow",
  SETUP = "__Host-gitrew_setup";
const setupSchema = z.object({
  setupToken: z.string().max(1024),
  organization: organizationSchema,
});
const authState = z.object({ verifier: z.string(), returnTo: z.string() });
const setupState = z.object({
  organization: organizationSchema,
  origin: z.url(),
});
const proxySchema = z
  .object({
    path: z.string().max(2048),
    method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]).default("GET"),
    body: z.unknown().optional(),
  })
  .strict();
const vaultSchema = z
  .object({
    organization: organizationSchema,
    operation: z.unknown(),
    nonce: z.uuid().optional(),
  })
  .strict();
function requireApp(app: App | null): App {
  if (!app)
    throw new HttpError(
      503,
      "This Gitrew deployment needs its GitHub App. Open setup to continue.",
    );
  return app;
}
function publicApp(app: App | null) {
  return app
    ? {
        appSlug: app.slug,
        owner: app.owner.login,
        installUrl: `https://github.com/apps/${app.slug}/installations/new`,
      }
    : null;
}
function canonical(request: Request, app: App) {
  if (new URL(request.url).origin !== app.origin)
    throw new HttpError(403, "Use this deployment's configured Gitrew address.");
}

export interface BackendEnv {
  DB?: D1Database;
  STORE?: BackendStore;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  SETUP_TOKEN: string;
  PUBLIC_APP: string;
  SANDBOX_ORGANIZATION: string;
  PLATFORM?: "cloudflare" | "vercel";
}

export default {
  async fetch(request: Request, env: BackendEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.protocol !== "https:" && !["localhost","127.0.0.1"].includes(url.hostname)) {
      url.protocol="https:";
      return redirect(url.href);
    }
    if (url.pathname === "/health")
      return json({ service: "gitrew", version: 1 });
    if (!url.pathname.startsWith("/api/")) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      // The sandbox publishes static files on GitHub Pages. Dynamic paths use
      // its public SPA shell; no cookies or private request headers are forwarded.
      if (/^\/(w|demo)\//.test(url.pathname) && ["GET", "HEAD"].includes(request.method)) {
        try {
          const shell = await fetch(new URL("/200.html", url.origin), {
            method: request.method, redirect: "manual", signal: AbortSignal.timeout(15_000),
          });
          if (shell.status >= 300 && shell.status < 400) return json({ error: "Gitrew frontend address needs attention." }, 502);
          return new Response(shell.body, { status: shell.status, headers: {
            "Content-Type": shell.headers.get("Content-Type") || "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          } });
        } catch { return json({ error: "Gitrew could not load. Reload and try again." }, 502); }
      }
      return json({ error: "Open the Gitrew frontend to continue." }, 404);
    }
    if (!env.STORE && !env.DB)
      return json({ error: "Configure this deployment's private storage before setup." }, 503);
    const store = env.STORE || new Store(env.DB!, env.SETUP_TOKEN || "");
    let sessionId = "";
    try {
      await store.initialize();
      if (url.pathname === "/api/config" && request.method === "GET") {
        const app = await store.app();
        return json({
          configured: Boolean(app),
          setupAvailable: (env.SETUP_TOKEN || "").length >= 32,
          app: publicApp(app),
          sandbox: env.SANDBOX_ORGANIZATION || "",
          platform: env.PLATFORM || "cloudflare",
        });
      }
      if (url.pathname === "/api/setup/start" && request.method === "POST") {
        sameOrigin(request);
        await store.rateLimit(request, "setup");
        const input = setupSchema.parse(await boundedJson(request));
        if (
          (env.SETUP_TOKEN || "").length < 32 ||
          !(await equal(input.setupToken, env.SETUP_TOKEN))
        )
          throw new HttpError(
            403,
            "The setup key does not match this deployment's SETUP_TOKEN.",
          );
        if (await store.app())
          throw new HttpError(
            409,
            "This deployment already has a GitHub App. Its credentials will not be replaced.",
          );
        const state = await store.state("setup", {
          organization: input.organization,
          origin: url.origin,
        });
        const manifest = {
          name:
            String(env.PUBLIC_APP) === "true"
              ? "Gitrew Sandbox"
              : `Gitrew ${input.organization}`,
          url: url.origin + "/",
          redirect_url: url.origin + "/api/setup/callback",
          callback_urls: [url.origin + "/api/auth/callback"],
          setup_url: url.origin + "/create/",
          public: String(env.PUBLIC_APP) === "true",
          hook_attributes: { url: url.origin + "/api/webhooks", active: true },
          default_permissions: {
            contents: "write",
            discussions: "write",
            issues: "write",
            administration: "write",
            pull_requests: "read",
            organization_projects: "read",
            members: "read",
            organization_administration: "read",
          },
          default_events: [],
        };
        return json(
          {
            action: `https://github.com/organizations/${input.organization}/settings/apps/new?state=${state}`,
            manifest: JSON.stringify(manifest),
          },
          200,
          { "Set-Cookie": setCookie(request, SETUP, state, 600) },
        );
      }
      if (url.pathname === "/api/setup/callback" && request.method === "GET") {
        const state = url.searchParams.get("state") || "",
          code = url.searchParams.get("code") || "";
        if (
          !/^[a-f0-9]{64}$/.test(state) ||
          !(await equal(state, cookie(request, SETUP))) ||
          !code ||
          code.length > 512
        )
          throw new HttpError(
            400,
            "This App registration could not be verified. Return to setup.",
          );
        return await store.locked("app-registration", async () => {
          if (await store.app())
            throw new HttpError(409, "The deployment already has an App.");
          const pending = setupState.parse(await store.consume(state, "setup"));
          if (pending.origin !== url.origin)
            throw new HttpError(
              400,
              "App registration belongs to another deployment.",
            );
          const response = await githubFetch(
            `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
            {
              method: "POST",
              headers: { Accept: "application/vnd.github+json" },
            },
          );
          if (!response.ok)
            throw new HttpError(
              502,
              "GitHub App registration could not be completed. Return to setup.",
            );
          const converted = appSchema
            .omit({ origin: true })
            .parse(await response.json());
          const app = appSchema.parse({ ...converted, origin: pending.origin });
          if (app.owner.login.toLowerCase() !== pending.organization)
            throw new HttpError(
              403,
              "GitHub registered this App under a different owner.",
            );
          await store.register(app);
          return redirect("/create/", [setCookie(request, SETUP, "", 0)]);
        });
      }
      const app = requireApp(await store.app());
      canonical(request, app);
      if (url.pathname === "/api/auth/start" && request.method === "GET") {
        await store.rateLimit(request, "login");
        const verifier = random();
        const challenge = Buffer.from(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(verifier),
          ),
        ).toString("base64url");
        // Only a known local destination is retained; no arbitrary redirect URL is accepted.
        const workspace = url.searchParams.get("workspace") || "";
        const returnTo = url.searchParams.get("setup") === "1" ? "/create/" :
          appReturnTo(url.searchParams.get("returnTo")) || legacyWorkspacePath(workspace) ||
          (env.SANDBOX_ORGANIZATION ? workspacePath(env.SANDBOX_ORGANIZATION) : "/login");
        const state = await store.state("oauth", { verifier, returnTo });
        const authorize = new URL("https://github.com/login/oauth/authorize");
        authorize.search = new URLSearchParams({
          client_id: app.client_id,
          redirect_uri: app.origin + "/api/auth/callback",
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
          scope: "offline_access",
        }).toString();
        return redirect(authorize.href, [setCookie(request, FLOW, state, 600)]);
      }
      if (url.pathname === "/api/auth/callback" && request.method === "GET") {
        const state = url.searchParams.get("state") || "",
          code = url.searchParams.get("code") || "";
        if (
          !/^[a-f0-9]{64}$/.test(state) ||
          !(await equal(state, cookie(request, FLOW)))
        )
          throw new HttpError(
            400,
            "This sign-in request could not be verified. Start again.",
          );
        const pending = authState.parse(await store.consume(state, "oauth"));
        if (!code || code.length > 512 || url.searchParams.has("error"))
          return redirect("/login?authError=cancelled&returnTo=" + encodeURIComponent(pending.returnTo), [
            setCookie(request, FLOW, "", 0),
          ]);
        const credentials = await oauthToken(app, {
          code,
          code_verifier: pending.verifier,
          redirect_uri: app.origin + "/api/auth/callback",
        });
        const actor = await new GitHub(credentials.accessToken).api(
          "/user",
          actorSchema,
        );
        const created = await store.createSession(actor.id, credentials);
        return redirect(pending.returnTo, [
          setCookie(request, SESSION, created.raw, 7 * 86400),
          setCookie(request, FLOW, "", 0),
        ]);
      }
      if (url.pathname === "/api/webhooks" && request.method === "POST") {
        const signature = request.headers.get("X-Hub-Signature-256") || "";
        const raw = await boundedBytes(request, 131_072);
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(app.webhook_secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const expected =
          "sha256=" +
          Buffer.from(await crypto.subtle.sign("HMAC", key, raw)).toString(
            "hex",
          );
        if (!(await equal(signature, expected)))
          throw new HttpError(403, "Invalid webhook signature.");
        const payload = z
          .object({
            action: z.string().optional(),
            sender: actorSchema.optional(),
          })
          .parse(JSON.parse(new TextDecoder().decode(raw)));
        if (
          request.headers.get("X-GitHub-Event") ===
            "github_app_authorization" &&
          payload.action === "revoked" &&
          payload.sender
        )
          await store.revoke(payload.sender.id);
        return json({ received: true });
      }
      const session = await store.session(cookie(request, SESSION));
      sessionId = session.id;
      if (request.method !== "GET") {
        sameOrigin(request);
        if (
          !(await equal(
            request.headers.get("X-Gitrew-CSRF") || "",
            session.csrf,
          ))
        )
          throw new HttpError(
            403,
            "This request could not be verified. Reload Gitrew.",
          );
      }
      if (url.pathname === "/api/logout" && request.method === "POST") {
        await store.logout(session.id);
        return json({ signedOut: true }, 200, {
          "Set-Cookie": setCookie(request, SESSION, "", 0),
        });
      }
      const { api, actor } = await authenticated(store, session, app);
      if (url.pathname === "/api/session" && request.method === "GET") {
        const selected = url.searchParams.get("organization");
        const workspace = selected
          ? await store.workspace(organizationSchema.parse(selected))
          : env.SANDBOX_ORGANIZATION
            ? await store.workspace(env.SANDBOX_ORGANIZATION)
            : await store.defaultWorkspace();
        if (workspace?.ready)
          await ensureWorkspaceAccess(api, app, workspace, actor);
        return json({
          viewer: actor,
          csrf: session.csrf,
          expiresAt: session.expires,
          app: publicApp(app),
          workspace: workspace?.ready ? workspaceConfig(workspace, app) : null,
          sandbox: env.SANDBOX_ORGANIZATION || "",
        });
      }
      if (url.pathname === "/api/workspaces" && request.method === "POST") {
        const { organization, repositoryName, vaultName } = z
          .object({
            organization: organizationSchema,
            repositoryName: repositoryNameSchema.optional(),
            vaultName: repositoryNameSchema.optional(),
          })
          .strict()
          .parse(await boundedJson(request));
        const workspace = await provisionWorkspace(
          store,
          api,
          actor,
          organization,
          env.SANDBOX_ORGANIZATION || "",
          { repositoryName, vaultName },
        );
        return json({ workspace: workspaceConfig(workspace, app) });
      }
      if (url.pathname === "/api/github" && request.method === "POST") {
        const input = proxySchema.parse(await boundedJson(request, 131_072));
        if (
          !/^\/(?:user(?:[/?]|$)|repos\/|orgs\/|users\/|graphql$)/.test(
            input.path,
          )
        )
          throw new HttpError(
            403,
            "This GitHub API operation is not available through Gitrew.",
          );
        const response = await api.response(
          input.path,
          input.method,
          input.body,
        );
        if (response.status === 401) await store.logout(session.id);
        return json(
          response.status === 204 ? null : await response.json(),
          response.status === 204 ? 200 : response.status,
          response.headers,
        );
      }
      if (url.pathname === "/api/vault" && request.method === "POST") {
        const input = vaultSchema.parse(await boundedJson(request));
        const workspace = await store.workspace(input.organization);
        if (!workspace?.ready)
          throw new HttpError(
            404,
            "This workspace has not been set up on this deployment.",
          );
        return json(
          await vaultOperation(
            store,
            app,
            workspace,
            actor,
            input.operation,
            input.nonce || crypto.randomUUID(),
          ),
        );
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      if (error instanceof HttpError && error.status === 401 && sessionId)
        await store.logout(sessionId);
      const status =
        error instanceof HttpError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 502;
      const message =
        error instanceof HttpError
          ? error.message
          : error instanceof z.ZodError
            ? "Invalid request."
            : "Gitrew could not complete this operation. Retry, or ask your administrator to check the GitHub App and workspace permissions.";
      return json(
        { error: message },
        status,
        status === 401
          ? { "Set-Cookie": setCookie(request, SESSION, "", 0) }
          : undefined,
      );
    }
  },
};
