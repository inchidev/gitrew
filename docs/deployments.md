# Product site and workspace installations

Gitrew uses one codebase with two deployment modes.

| Address | Purpose | Infrastructure |
| --- | --- | --- |
| `gitrew.com` | Public landing and `/#install` installation links | Static assets; no GitHub credentials, D1 or workspace API |
| `inchi.gitrew.com` | Our inchidev workspace, restricted to the `inchi` team | Its own Worker, D1, LiveHub and GitHub App |
| `afterprompt.gitrew.com` | Workspace for the `afterprompt` team | Separate Worker, D1, LiveHub, App and chat/vault repositories |
| `example.com` or `gitrew.example.com` | Customer-owned workspace | Customer's Cloudflare account or celld server |

The public `/#install` section links to Cloudflare and VPS instructions. After
deployment, the owner opens `/create/` at their deployed HTTPS origin to register
their GitHub App. The public `/create/` page is removed and returns 404. Gitrew.com
does not receive installation credentials, create hosted tenants or store conversations.
Members sign in at the workspace address supplied by their team.

## Public site

Build with `npm run build:portal`; deploy with `wrangler.portal.jsonc`. The build
sets `NUXT_PUBLIC_SITE_MODE=portal` and disables the backend. Only the landing
page is registered. Unknown paths, including workspace and API paths,
return 404. The public Worker has only static assets and no access to workspace
resources. CI checks this mode separately from the workspace build.

## Independent workspaces

Use the standard Cloudflare or celld guide. Frontend and API deploy together;
there is no separate frontend project to maintain. Reuse the source, not an
existing installation's configuration, setup key, sessions or GitHub App.
Choose the final domain before registration. Distinct deployments in one GitHub
organization need distinct chat/vault repository names. Every workspace
repository name must start with `gitrew-` so Gitrew-managed storage is obvious
at a glance (for example `gitrew-afterprompt-chat`).

## What the Cloudflare button creates

1. Cloudflare copies this source into **one new code repository** in the Git account selected in the deployment form. The private-repository checkbox applies to this code copy. It connects that repository to Workers Builds; pushes to its production branch build and deploy the installation. Changes to our upstream repository do not automatically sync into that copy.
2. Cloudflare deploys **one Worker** containing the frontend and API, and provisions or connects its D1 database and LiveHub Durable Object binding. Use a separate database and setup key for each independent installation.
3. At the new site's `/create/`, the owner supplies `SETUP_TOKEN` and approves the GitHub App manifest. **This creates one GitHub App for the installation**, after the Cloudflare deployment. Ordinary code redeployments reuse its encrypted configuration; they do not create another App.
4. The owner installs that App in their GitHub organization and provisions the workspace. Gitrew creates **two private conversation repositories in that organization**: `gitrew-chat` and `gitrew-vault`, or other chosen names starting with `gitrew-`. These are separate from the code repository. The vault remains administrator-only.

The Cloudflare GitHub integration that connects Workers Builds to the code copy
is separate from the Gitrew App created during workspace setup.

For a fresh button installation, the usual total is **three new repositories**:
one code copy plus the chat/vault pair. The code copy may belong to a personal
account while the conversation repositories belong to the organization. Members
then sign in with GitHub at the deployed workspace address; they do not deploy
anything or create another GitHub App.

See [Cloudflare's Deploy button flow](https://developers.cloudflare.com/workers/platform/deploy-buttons/)
and the [Cloudflare setup guide](cloudflare-backend.md).

## Our workspace rollout

The inchidev workspace moves from `https://gitrew.inchi.dev` to
`https://inchi.gitrew.com`, retaining its database, conversations and GitHub App.
The maintained `wrangler.inchidev.jsonc` declares `APP_ORIGIN` for the new address
and keeps the old domain as a frontend redirect. Update the GitHub App's homepage,
OAuth callback, setup URL and webhook endpoint together with this override.
Old-origin session cookies and installed PWAs do not transfer to a new origin:
members sign in and install again; push subscriptions must be registered again.
The redirect runs before static assets (`assets.run_worker_first: true`). API
requests must use the configured origin; old cookies are not forwarded.

AfterPrompt uses `gitrew-afterprompt-chat` and `gitrew-afterprompt-vault`, with App access
selected for the relevant AfterPrompt repositories. The configured GitHub Team
slug is `afterprompt`. The maintained `wrangler.afterprompt.jsonc` deploys its
independent resources, with a distinct `APP_NAME` for App registration.

Set `ALLOWED_TEAM` to a GitHub Team slug to restrict a deployment. Every session
and authenticated API operation rechecks current organization and team membership;
pending memberships and failed permission checks do not grant access. OAuth,
realtime ticket creation/consumption, huddles and push delivery enforce the same
policy. Membership webhooks close affected live sessions; socket leases also
expire within four minutes and huddle leases within 90 seconds without renewal.
Organization owners remain trusted administrators and can enter without team
membership. An unknown/deleted team admits no ordinary members.

Give the team Read access to its chat repository and only the required rights to
its source repositories. Team-restricted deployments do not automatically grant
individual chat repository access. Removing a team membership therefore also
removes the inherited GitHub read grant, provided no separate direct/other-team
grant exists. Audit those grants separately. **Never grant the ordinary team
access to the vault**, which remains administrator-only.

Without `ALLOWED_TEAM`, the existing organization-wide access policy remains.
Keep the same policy configured across deployments/redeployments; removing it
intentionally broadens workspace access to active organization members.

The same policy can restrict the main inchi workspace if project members should
not enter it. Organization base permissions remain None; teams receive explicit
access to their project repositories. Public source repositories remain public.

## Future hosted service

A shared service that provisions workspaces on demand under `*.gitrew.com` would
need a control plane, tenant authorization, provisioning, lifecycle management,
quotas and an operating/billing model. The public landing and installer do not
provide that service today. Our two subdomains are installations we operate.
