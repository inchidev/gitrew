# Gitrew on Cloudflare

For your own server, see [celld](celld.md) and the [VPS guide](vps.md). Gitrew now targets Workers-compatible runtimes with D1 and Durable Objects.

The recommended independent deployment is one Worker serving the static Nuxt
client and API, plus LiveHub for live communication and D1 for encrypted credentials, sessions, setup state and
workspace connections. Conversations remain in GitHub Discussions. This change
does not implement a model runtime or Copilot integration.

## Deploy your own

1. Click [Deploy to Cloudflare](https://deploy.workers.cloudflare.com/?url=https://github.com/inchidev/gitrew).
2. Keep the detected deploy command (`npm run deploy`). Choose a random secret
   `SETUP_TOKEN` of at least 32 characters. Cloudflare provisions D1 and the LiveHub Durable Object binding.
3. Open `/create/` on the deployed site. Configure your custom domain before App
   registration, if needed, so that the callback address is final.
4. Enter your GitHub organization and deployment setup key, then review and create
   the preconfigured App on GitHub. Its keys return directly to your backend.
5. Sign in, install your App in the organization, choose repository names, then
   create the workspace. Defaults are `gitrew-chat` and `gitrew-vault`; a second
   deployment in the same organization needs different, unused names.
6. Have teammates accept their GitHub organization invitations, then use
   **Workspace members** in the sidebar to add their usernames. Create private
   channels/DMs with selected participants and share `/w/YOUR_ORGANIZATION`.
   Do not grant them vault repository access. Verify a second participant's flow.

If Cloudflare did not prompt for `SETUP_TOKEN`, add it as a Worker secret under
Settings before setup. This is the only manually supplied deployment secret.
Keep it unchanged and backed up: it encrypts saved App credentials and sessions.
Losing or replacing it makes those records unreadable. Do not share it with
ordinary participants. No Cloudflare management token or GitHub PAT is entered
into Gitrew. GitHub registration, authorization and installation approvals remain
necessary; this is a guided deployment, not literally one click.

Setup checkpoints live in D1 across reloads. Interrupted repository setup reuses
its nonce and refuses to overwrite unrelated repositories. If manifest conversion
loses its returned credentials before saving them, review the App on GitHub and
register again; the backend cannot assume it can recover the private key.

## Ownership and GitHub access

Each independent deployment registers its own private App in its own Cloudflare account. Gitrew does not operate a shared authentication service.

The manifest requests Contents and Discussions write access, Issues write access and pull
requests read access, repository Administration write access for provisioning,
and organization Membership, Administration and Projects read access. Repository
Administration also grants organization members read access to the chat repository. Review the
exact permissions in GitHub. Install on selected repositories; repositories
created by the App become accessible to it automatically.

Workspace setup creates private `gitrew-chat` and private `gitrew-vault` for all
private channels and DMs. Organization base repository permission must be **None**;
Gitrew checks this and does not change access to unrelated repositories. All vault
repository access, including inherited access, must belong to declared admins.
The backend verifies conversation ACLs and current GitHub organization roles on
private requests. Former or demoted organization admins cannot retain admin
access solely through an old workspace entry.

For the shared sandbox, the operator sets `PUBLIC_APP=true` and
`SANDBOX_ORGANIZATION` to the chosen GitHub organization before registration.
Both sandbox and independent deployments require active GitHub organization
membership. On sign-in, members receive read access only to the private chat
repository. The App uses a chat-scoped Administration write token for that grant
and revokes it afterward. The sandbox may allow members to create private groups;
legacy open-registration flags cannot allow outsiders. Independent deployments
default to private Apps and closed registration.

## Sessions and trust

OAuth uses PKCE, browser-bound single-use state and a fixed callback origin.
A Secure, HttpOnly, SameSite=Lax cookie identifies the session. D1 stores its
hashed identifier and encrypted GitHub credentials. The browser receives identity,
workspace metadata and a CSRF proof, not GitHub tokens. Writes require both the
proof and the exact site origin. Refresh remains server-side; GitHub identity is
checked on authenticated requests, and signed revocation webhooks invalidate
sessions. Logout removes the server session and frontend conversation caches.

Ordinary GitHub operations use the person's token and the intersection of their
permissions with the App's permissions. Vault operations mint a repository-scoped
installation token with the required Contents, Discussions and organization
Membership permissions. It never reaches the browser and is revoked afterward,
including on operation failure. Per-workspace serialization protects concurrent
membership and private writes; failed sends retain their retry nonce.

Private messages are not encrypted against GitHub, workspace administrators or
the backend operator. Independent hosting transfers that operator role to you.
The backend bounds request/response bodies, applies timeouts and login/setup rate
limits, and redacts query strings in observability. It does not log credentials
or request bodies. Gitrew is free; your own platform and optional media usage remain yours.

## Development and validation

```sh
npm ci
cp .dev.vars.example .dev.vars
# Set a development-only setup key in .dev.vars.
npm run build:worker
npm run dev:worker
npm run check
npx playwright test -c playwright.backend.config.ts
npx wrangler deploy --dry-run
```

D1 schema initialization is automatic. Independent copies require their owners to
review and deploy updates. Callback URLs must match when changing domains.
The old static/Actions mode remains available with backend mode disabled; see
[self-hosting.md](self-hosting.md).

Worker tests run in workerd with local D1 and simulated GitHub responses. Browser
tests cover App registration, owner provisioning, public/private transport and
logout with mocked APIs. These checks are distinct from live GitHub authorization,
fresh-team deployment and second-account verification. Record live evidence only
after checking it. The npm audit still reports existing Nuxt/build-tool dependency
advisories; this change does not resolve those unrelated dependencies. The API
Worker bundles Zod and the vault code, not a Nuxt development server.

References: [GitHub App manifests](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest),
[GitHub user tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app),
[Cloudflare deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/).
