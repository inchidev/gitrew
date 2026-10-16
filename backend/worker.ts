import {
  PushStore,
  pushEnabled,
  subscriptionSchema,
  type PushEnv,
} from "./push";
import {
  deploymentApp,
  requireTeamAccess,
  WorkspaceAccessError,
} from "./access";
import { mediaProvider, type MediaEnv } from "./huddles";
import { accessReportSchema, workspaceSettingsSchema } from "../shared/access";
import { WorkspaceMemberRequired } from "../shared/vault";
import { displayName, inspectAccess } from "./access-report";
import type { LiveHub, LiveIdentity } from "./live-hub";
import { authorizeRoom, roomSchema } from "./live-access";
import {
  appReturnTo,
  legacyWorkspacePath,
  workspacePath,
} from "../shared/routes";
import { Buffer } from "node:buffer";
import { repositoryNameSchema } from "../shared/workspace";
import { z } from "zod";
import {
  appSchema,
  Store,
  type App,
  type BackendStore,
  type Session,
} from "./store";
import {
  authenticated,
  identified,
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
import { handlePublic } from "./public";

const SESSION = "__Host-gitrew_session",
  FLOW = "__Host-gitrew_flow",
  SETUP = "__Host-gitrew_setup",
  ACCESS = "__Host-gitrew_access";
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
    throw new HttpError(
      403,
      "Use this deployment's configured Gitrew address.",
    );
}

export interface BackendEnv extends MediaEnv, PushEnv {
  DB?: D1Database;
  LIVE?: DurableObjectNamespace<LiveHub>;
  STORE?: BackendStore;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  SETUP_TOKEN: string;
  PUBLIC_APP: string;
  SANDBOX_ORGANIZATION: string;
  PLATFORM?: "cloudflare" | "celld";
  APP_ORIGIN?: string;
  ALLOWED_TEAM?: string;
  APP_NAME?: string;
  WORKSPACE_NAME?: string;
  PUBLIC_MODE?: string;
  PUBLIC_GITHUB_TOKEN?: string;
}

export default {
  async fetch(
    request: Request,
    env: BackendEnv,
    ctx?: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (
      env.APP_ORIGIN &&
      !url.pathname.startsWith("/api/") &&
      ["GET", "HEAD"].includes(request.method)
    ) {
      const target = new URL(env.APP_ORIGIN);
      if (target.protocol === "https:" && target.origin !== url.origin)
        return Response.redirect(
          new URL(url.pathname + url.search, target.origin).href,
          308,
        );
    }
    if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    ) {
      url.protocol = "https:";
      return redirect(url.href);
    }
    if (url.pathname === "/health")
      return json({ service: "gitrew", version: 1 });
    if (!url.pathname.startsWith("/api/")) {
      // Public browsing is client-rendered for arbitrary owners and
      // repositories, so its shell comes from the binding even when the
      // deployment keeps 404s for every other unknown path.
      if (
        env.ASSETS &&
        /^\/github\//.test(url.pathname) &&
        ["GET", "HEAD"].includes(request.method)
      ) {
        return env.ASSETS.fetch(new Request(new URL("/200.html", url.origin), {
          method: request.method,
          headers: { Accept: "text/html" },
        }));
      }
      if (env.ASSETS) return env.ASSETS.fetch(request);
      // The sandbox publishes static files on GitHub Pages. Dynamic paths use
      // its public SPA shell; no cookies or private request headers are forwarded.
      if (
        /^\/(w|demo|github)\//.test(url.pathname) &&
        ["GET", "HEAD"].includes(request.method)
      ) {
        try {
          const shell = await fetch(new URL("/200.html", url.origin), {
            method: request.method,
            redirect: "manual",
            signal: AbortSignal.timeout(15_000),
          });
          if (shell.status >= 300 && shell.status < 400)
            return json(
              { error: "Gitrew frontend address needs attention." },
              502,
            );
          return new Response(shell.body, {
            status: shell.status,
            headers: {
              "Content-Type":
                shell.headers.get("Content-Type") || "text/html; charset=utf-8",
              "Cache-Control": "no-store",
            },
          });
        } catch {
          return json(
            { error: "Gitrew could not load. Reload and try again." },
            502,
          );
        }
      }
      return json({ error: "Open the Gitrew frontend to continue." }, 404);
    }
    if (!env.STORE && !env.DB)
      return json(
        { error: "Configure this deployment's private storage before setup." },
        503,
      );
    // Anonymous public browsing needs no session, App or workspace. In public
    // mode it is the only API surface; every other /api/* path stays 404.
    if (url.pathname.startsWith("/api/public/")) {
      try {
        const response = await handlePublic(request, url, env);
        if (response) return response;
      } catch (error) {
        if (error instanceof HttpError)
          return json({ error: error.message }, error.status);
        if (error instanceof z.ZodError)
          return json({ error: "Invalid request." }, 400);
        return json(
          { error: "Gitrew could not complete this operation." },
          502,
        );
      }
    }
    if (env.PUBLIC_MODE === "true")
      return json({ error: "Not found." }, 404);
    const store = env.STORE || new Store(env.DB!, env.SETUP_TOKEN || "");
    let sessionId = "",
      sessionUserId = 0;
    try {
      await store.initialize();
      if (url.pathname === "/api/config" && request.method === "GET") {
        const app = await store.app();
        const workspace = await store.defaultWorkspace();
        return json({
          displayName: displayName(workspace, app, env.WORKSPACE_NAME),
          workspaceReady: Boolean(workspace?.ready),
          configured: Boolean(app),
          setupAvailable: (env.SETUP_TOKEN || "").length >= 32,
          app: publicApp(app),
          sandbox: env.SANDBOX_ORGANIZATION || "",
          platform: env.PLATFORM || "cloudflare",
          realtime: Boolean(env.LIVE),
          huddles: env.LIVE ? mediaProvider(env) : null,
          push: pushEnabled(env),
          pushPublicKey: pushEnabled(env) ? env.VAPID_PUBLIC_KEY : null,
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
            env.APP_NAME ||
            (String(env.PUBLIC_APP) === "true"
              ? "Gitrew Sandbox"
              : `Gitrew ${input.organization}`),
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
          default_events: [
            "discussion",
            "discussion_comment",
            "membership",
            "member",
            "organization",
          ],
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
      const app = deploymentApp(requireApp(await store.app()), env);
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
        const returnTo =
          url.searchParams.get("setup") === "1"
            ? "/create/"
            : appReturnTo(url.searchParams.get("returnTo")) ||
              legacyWorkspacePath(workspace) ||
              (env.SANDBOX_ORGANIZATION
                ? workspacePath(env.SANDBOX_ORGANIZATION)
                : "/login");
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
        return redirect(authorize.href, [
          setCookie(request, FLOW, state, 600),
          setCookie(request, ACCESS, "", 0),
        ]);
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
          return redirect(
            "/login?authError=cancelled&returnTo=" +
              encodeURIComponent(pending.returnTo),
            [setCookie(request, FLOW, "", 0)],
          );
        const credentials = await oauthToken(app, {
          code,
          code_verifier: pending.verifier,
          redirect_uri: app.origin + "/api/auth/callback",
        });
        const actor = await new GitHub(credentials.accessToken).api(
          "/user",
          actorSchema,
        );
        try {
          await requireTeamAccess(
            new GitHub(credentials.accessToken),
            app,
            actor.login,
          );
        } catch {
          // Identity is known, but permission denial or verification failure
          // must not create a session. Keep only browser-bound diagnostics.
          const report = await inspectAccess(
            store,
            new GitHub(credentials.accessToken),
            app,
            actor,
            env.WORKSPACE_NAME,
          );
          const diagnostic = await store.state("access", {
            report,
            returnTo: appReturnTo(pending.returnTo),
          });
          let previous: Session | null = null;
          try {
            previous = await store.session(cookie(request, SESSION));
          } catch (error) {
            if (!(error instanceof HttpError) || error.status !== 401)
              throw error;
          }
          if (previous) {
            await store.logout(previous.id);
            if (pushEnabled(env)) await new PushStore(env).revoke(previous.id);
            const workspace = await store.defaultWorkspace();
            if (workspace)
              await env.LIVE?.getByName(workspace.organization).revoke(
                previous.userId,
                previous.id,
              );
          }
          return redirect("/access/", [
            setCookie(request, FLOW, "", 0),
            setCookie(request, SESSION, "", 0),
            setCookie(request, ACCESS, diagnostic, 600),
          ]);
        }
        const created = await store.createSession(actor.id, credentials);
        return redirect(pending.returnTo, [
          setCookie(request, SESSION, created.raw, 7 * 86400),
          setCookie(request, FLOW, "", 0),
          setCookie(request, ACCESS, "", 0),
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
            installation: z.object({ id: z.number() }).optional(),
            repository: z.object({ full_name: z.string() }).optional(),
            discussion: z.object({ node_id: z.string() }).optional(),
            comment: z.object({ node_id: z.string() }).optional(),
            membership: z.object({ user: actorSchema }).optional(),
            member: actorSchema.optional(),
          })
          .parse(JSON.parse(new TextDecoder().decode(raw)));
        const event = request.headers.get("X-GitHub-Event");
        const workspace = await store.defaultWorkspace();
        const hub = workspace && env.LIVE?.getByName(workspace.organization);
        if (
          event === "github_app_authorization" &&
          payload.action === "revoked" &&
          payload.sender
        ) {
          await store.revoke(payload.sender.id);
          await hub?.revoke(payload.sender.id);
        }
        if (
          workspace &&
          hub &&
          payload.installation?.id === workspace.installationId
        ) {
          if (
            ["discussion", "discussion_comment"].includes(event || "") &&
            [workspace.repository, workspace.vault].includes(
              payload.repository?.full_name || "",
            )
          ) {
            // Never publish private bodies, participant lists or titles via webhooks.
            await hub.emit(payload.discussion?.node_id || "", {
              type: "refresh",
            });
            if (
              event === "discussion_comment" &&
              payload.action === "created" &&
              payload.discussion &&
              payload.comment &&
              pushEnabled(env)
            ) {
              const notify = new PushStore(env).notify(
                store,
                app,
                workspace.organization,
                payload.discussion.node_id,
                payload.comment.node_id,
                payload.sender?.id,
              );
              if (ctx) ctx.waitUntil(notify.catch(() => undefined));
              else await notify.catch(() => undefined);
            }
          }
          if (["membership", "member", "organization"].includes(event || "")) {
            const member = payload.membership?.user || payload.member;
            if (member) await hub.revoke(member.id);
          }
        }
        return json({ received: true });
      }
      if (url.pathname === "/api/access" && request.method === "GET") {
        await store.rateLimit(request, "access");
        let current: Session;
        try {
          current = await store.session(cookie(request, SESSION));
        } catch (error) {
          if (!(error instanceof HttpError) || error.status !== 401)
            throw error;
          const snapshot = z
            .object({
              report: accessReportSchema,
              returnTo: z.string().nullable(),
            })
            .parse(await store.readAccess(cookie(request, ACCESS)));
          return json({
            ...snapshot.report,
            returnTo: appReturnTo(snapshot.returnTo),
            snapshot: true,
          });
        }
        sessionId = current.id;
        sessionUserId = current.userId;
        const { api, actor } = await identified(store, current, app);
        return json({
          ...(await inspectAccess(store, api, app, actor, env.WORKSPACE_NAME)),
          snapshot: false,
        });
      }
      const session = await store.session(cookie(request, SESSION));
      sessionId = session.id;
      sessionUserId = session.userId;
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
        if (pushEnabled(env)) await new PushStore(env).revoke(session.id);
        const workspace = await store.defaultWorkspace();
        if (workspace)
          await env.LIVE?.getByName(workspace.organization).revoke(
            session.userId,
            session.id,
          );
        return json({ signedOut: true }, 200, {
          "Set-Cookie": setCookie(request, SESSION, "", 0),
        });
      }
      const { api, actor } = await authenticated(store, session, app);
      if (
        url.pathname === "/api/workspace/settings" &&
        request.method === "POST"
      ) {
        const settings = workspaceSettingsSchema.parse(
          await boundedJson(request),
        );
        const workspace = await store.defaultWorkspace();
        if (!workspace?.ready)
          throw new HttpError(409, "Finish workspace setup first.");
        await ensureWorkspaceAccess(api, app, workspace, actor);
        const members = z
          .object({ admins: z.array(z.number()) })
          .parse(
            await vaultOperation(
              store,
              app,
              workspace,
              actor,
              { op: "members" },
              crypto.randomUUID(),
            ),
          );
        if (!members.admins.includes(actor.id))
          throw new HttpError(
            403,
            "Only workspace administrators can change settings.",
          );
        const updated = await store.locked(
          "settings:" + workspace.organization,
          async () => {
            const current = await store.workspace(workspace.organization);
            if (!current?.ready)
              throw new HttpError(409, "Workspace setup is not ready.");
            const value = { ...current, ...settings };
            await store.saveWorkspace(value);
            return value;
          },
        );
        return json({
          workspace: workspaceConfig(updated, app, env.WORKSPACE_NAME),
        });
      }
      if (url.pathname === "/api/session" && request.method === "GET") {
        const selected = url.searchParams.get("organization");
        const workspace = selected
          ? await store.workspace(organizationSchema.parse(selected))
          : env.SANDBOX_ORGANIZATION
            ? await store.workspace(env.SANDBOX_ORGANIZATION)
            : await store.defaultWorkspace();
        const administrator = workspace?.ready
          ? await ensureWorkspaceAccess(api, app, workspace, actor)
          : false;
        return json({
          viewer: actor,
          csrf: session.csrf,
          expiresAt: session.expires,
          app: publicApp(app),
          workspace: workspace?.ready
            ? {
                ...workspaceConfig(workspace, app, env.WORKSPACE_NAME),
                administrator,
              }
            : null,
          sandbox: env.SANDBOX_ORGANIZATION || "",
        });
      }
      if (url.pathname === "/api/push" && request.method === "POST") {
        if (!pushEnabled(env))
          throw new HttpError(
            409,
            "Push notifications are not configured on this installation.",
          );
        const input = z
          .object({
            room: roomSchema,
            subscription: subscriptionSchema,
            remove: z.boolean().optional(),
          })
          .parse(await boundedJson(request));
        const push = new PushStore(env);
        if (input.remove)
          await push.remove(actor.id, input.subscription.endpoint, input.room);
        else {
          await authorizeRoom(store, app, api, actor, input.room);
          await push.save(actor.id, session.id, input.room, input.subscription);
        }
        return json({ ok: true });
      }
      if (
        url.pathname.startsWith("/api/huddle/") &&
        request.method === "POST"
      ) {
        if (!env.LIVE)
          throw new HttpError(409, "Huddles need the realtime backend.");
        const input = z
          .object({ room: roomSchema, lease: z.uuid().optional() })
          .parse(await boundedJson(request));
        await authorizeRoom(store, app, api, actor, input.room);
        const hub = env.LIVE.getByName(input.room.organization);
        if (url.pathname === "/api/huddle/join") {
          if (!(await hub.consumeRate(`huddle:${actor.id}`, 8)))
            throw new HttpError(
              429,
              "Wait a minute before joining another huddle.",
            );
          return json(
            await hub.joinHuddle(
              input.room.channel,
              actor.login,
              actor.id,
              session.id,
            ),
          );
        }
        if (!input.lease) throw new HttpError(400, "Huddle lease required.");
        if (url.pathname === "/api/huddle/heartbeat") {
          if (!(await hub.heartbeatHuddle(input.lease, session.id)))
            throw new HttpError(410, "Your huddle ended. Join again.");
          return json({ ok: true });
        }
        if (url.pathname === "/api/huddle/leave") {
          await hub.leaveHuddle(input.lease, session.id);
          return json({ ok: true });
        }
      }
      if (url.pathname === "/api/live/ticket" && request.method === "POST") {
        if (!env.LIVE)
          throw new HttpError(
            409,
            "Realtime is not enabled on this deployment.",
          );
        const room = roomSchema.parse(await boundedJson(request));
        await authorizeRoom(store, app, api, actor, room);
        const ticket = await store.state("live", {
          room,
          sessionId: session.id,
          userId: actor.id,
          login: actor.login,
        });
        return json({ ticket });
      }
      if (url.pathname === "/api/live/socket" && request.method === "GET") {
        sameOrigin(request);
        if (
          !env.LIVE ||
          request.headers.get("Upgrade")?.toLowerCase() !== "websocket"
        )
          throw new HttpError(426, "WebSocket required.");
        const ticket = z
          .object({
            room: roomSchema,
            sessionId: z.string(),
            userId: z.number(),
            login: z.string(),
          })
          .parse(
            await store.consume(url.searchParams.get("ticket") || "", "live"),
          );
        if (ticket.sessionId !== session.id || ticket.userId !== actor.id)
          throw new HttpError(403, "Socket belongs to another session.");
        // Recheck access at consumption: a ticket does not preserve removed membership.
        await authorizeRoom(store, app, api, actor, ticket.room);
        const identity: LiveIdentity = {
          userId: actor.id,
          login: actor.login,
          sessionId: session.id,
          expires: Math.min(session.expires, Date.now() + 240_000),
          channel: ticket.room.channel,
          kind: ticket.room.kind,
          lastTyping: 0,
        };
        return env.LIVE.getByName(ticket.room.organization).fetch(
          new Request(request.url, {
            headers: {
              Upgrade: "websocket",
              "X-Gitrew-Live": JSON.stringify(identity),
            },
          }),
        );
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
        return json({
          workspace: workspaceConfig(workspace, app, env.WORKSPACE_NAME),
        });
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
        if (
          response.ok &&
          input.method !== "GET" &&
          (input.path !== "/graphql" ||
            /^\s*mutation\b/.test(
              String((input.body as { query?: string })?.query || ""),
            ))
        ) {
          const workspace = await store.defaultWorkspace();
          if (workspace)
            await env.LIVE?.getByName(workspace.organization)
              .emit("", {
                type: "refresh",
              })
              .catch(() => undefined);
        }
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
        const result = await vaultOperation(
          store,
          app,
          workspace,
          actor,
          input.operation,
          input.nonce || crypto.randomUUID(),
        );
        const op = input.operation as {
          op?: string;
          conversation?: string;
          userId?: number;
        };
        if (op.op === "send" && op.conversation && pushEnabled(env)) {
          const message = (result as { message?: { id: string } }).message;
          if (message) {
            const notify = new PushStore(env).notify(
              store,
              app,
              workspace.organization,
              op.conversation,
              message.id,
              actor.id,
            );
            if (ctx) ctx.waitUntil(notify.catch(() => undefined));
            else await notify.catch(() => undefined);
          }
        }
        if (op.op === "send")
          await env.LIVE?.getByName(workspace.organization)
            .emit(op.conversation || "", { type: "refresh" })
            .catch(() => undefined);
        if (["create", "invite", "remove", "join"].includes(op.op || "")) {
          if (op.op === "remove" && op.userId)
            await env.LIVE?.getByName(workspace.organization).revoke(op.userId);
          await env.LIVE?.getByName(workspace.organization)
            .emit("", {
              type: "refresh",
            })
            .catch(() => undefined);
        }
        return json(result);
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      if (
        error instanceof HttpError &&
        (error.status === 401 || error instanceof WorkspaceAccessError) &&
        sessionId
      ) {
        if (error.status === 401) await store.logout(sessionId);
        const workspace = await store.defaultWorkspace();
        if (workspace)
          await env.LIVE?.getByName(workspace.organization).revoke(
            sessionUserId,
            sessionId,
          );
      }
      const status =
        error instanceof WorkspaceMemberRequired
          ? 403
          : error instanceof HttpError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : 502;
      const message =
        error instanceof WorkspaceMemberRequired
          ? "Private conversations need workspace membership. Ask an administrator to add you in Workspace members. Shared channels remain available."
          : error instanceof HttpError
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
