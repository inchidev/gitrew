# Hosted workspaces on gitrew.com (design)

Status: design, not implemented. The [deployments](deployments.md) model still
applies: today every workspace runs on its own domain with its own GitHub App.

## Model

- gitrew.com hosts shared workspaces for any GitHub organization at
  `/w/:org`: our frontend, our backend, our GitHub App.
- Self-deployed workspaces stay as the privacy option: same repository, own
  domain, own App, own data. Nothing about the hosted service removes that path.
- Hosted is not E2EE and does not change [operator trust](architecture.md#storage-and-operator-trust):
  GitHub, workspace administrators and the backend operator can read private
  content. Organizations that need custody of their credentials self-host.

## GitHub App model: one public App, N installations

One public Gitrew GitHub App installed separately into each hosted organization.
One credential set (`client_id`/`client_secret`/private key) in the hosted D1;
per-org installation IDs recorded at provision time. This avoids a per-org
secrets table: the data plane already mints repo-scoped installation tokens per
workspace (`backend/workspace.ts`, `scripts/vault-service.ts`).

## Backend changes (phase 1)

Single-tenancy assumptions to remove; all references are current `main`:

1. Resolve the request organization once per request from a validated source:
   body/room org for `/api/vault`, `/api/workspaces`, `/api/live/*`,
   `/api/huddle/*`; `?organization=` for `/api/session`. Cookie-only routes
   (`/api/github`, `/api/access`, `/api/logout`) need an explicit org context
   instead of `store.defaultWorkspace()` (`backend/worker.ts`).
2. Gate login on the requested org, not the App-owner org. `authenticated()`
   (`backend/github.ts`) calls `requireTeamAccess(api, app, login)` against
   `app.owner.login` (`backend/access.ts`); it must check the request org.
   Same for `inspectAccess()` (`backend/access-report.ts`), which pins
   `store.workspace(app.owner.login)`.
3. Scope sessions by org. `sessions` has no organization column
   (`backend/store.ts:48`); `revoke(userId)` kills all orgs at once. Logout,
   the 401-cleanup handler and `github_app_authorization.revoked` handling must
   revoke `(user, org)` and only `LIVE.getByName(org)`.
4. Dispatch webhooks by installation. Today only `defaultWorkspace()` is
   consulted and other orgs' events are dropped (`backend/worker.ts`). Add an
   `installationId → organization` map at provision time.
5. Per-org team policy. `ALLOWED_TEAM`/`APP_ORIGIN` are deployment-global
   (`backend/access.ts`); on a shared domain they must become per-org settings
   with env values as defaults.
6. Secrets, minimal cut: keep the single `SETUP_TOKEN` KEK (avoids a
   re-encryption migration) but scope AES-GCM associated data to `org:id` so a
   cross-org confused deputy fails closed. Rotation still affects all tenants;
   per-org DEKs are later work.

Already per-org and reusable as-is: `workspaces` rows keyed by organization
(`backend/store.ts`), `ensureWorkspaceAccess`/`vaultOperation` repo-scoped
checks (`backend/workspace.ts`), `authorizeRoom` channel-ownership checks
(`backend/live-access.ts`), `LIVE.getByName(org)` instance isolation, and
org-tagged `push_subscriptions` (`backend/push.ts`).

`PUBLIC_MODE` needs no change: the portal Worker stays anonymous-only on its
own D1. The hosted API is a separate full-backend deployment on gitrew.com.

## Frontend changes (phase 2)

`/w/:org` routing is already org-scoped (`shared/routes.ts`,
`app/pages/w/[organization]/[[...conversation]].vue`):

1. Org-aware entry: `/login?org=` (or via `?returnTo=/w/:org`, which partially
   works today) with the workspace display name in the sign-in UI, instead of
   falling back to `SANDBOX_ORGANIZATION`/`defaultRepository`.
2. Scope persisted workspace choice by org: `gitrew:workspaces:v2` and
   `gitrew:auth-repository:v1` are user-global today and can leak a cross-org
   fallback (`app/components/Gitrew.vue`, `app/composables/useGitHubAuth.ts`).
3. Org-scoped `/access/` diagnostics: pass `?organization=` through to an
   org-aware `/api/access`.
4. A minimal org picker/directory on `/login` so users can discover
   `gitrew.com/w/:org` without knowing URL grammar.

## Operations (phase 3)

- Per-org quotas and abuse limits (API, webhooks, push, upstream GitHub calls
  share one App rate-limit budget across tenants).
- Self-serve onboarding: install App → provision workspace (`POST
  /api/workspaces` exists but is single-App-gated today) → first sign-in.
- Lifecycle: suspend/remove org, rotate hosted KEK, incident isolation per org.
- Cost and billing model: D1/DO egress, push, media provider per org.
- Docs: rewrite the installer-first narrative (`deployments.md`,
  `architecture.md`, landing copy) so "use hosted" is default and
  "self-host" is the privacy option.

## Open questions

- One shared D1 vs database-per-org (blast radius, backup/restore, cost).
- Whether `ALLOWED_TEAM`-style restrictions or open org membership is the
  hosted default.
- Moderation: who can report/takedown a workspace, and what data retention
  applies before an org migrates to self-host.
