# Product site and workspace installations

Gitrew uses one codebase with two deployment modes.

| Address | Purpose | Infrastructure |
| --- | --- | --- |
| `gitrew.com` | Public landing and `/create/` installation guide | Static assets; no GitHub credentials, D1 or workspace API |
| `inchi.gitrew.com` | Our inchidev workspace, restricted to the `inchi` team | Its own Worker, D1, LiveHub and GitHub App |
| `afterprompt.gitrew.com` | Workspace for the `afterprompt` team | Separate Worker, D1, LiveHub, App and chat/vault repositories |
| `example.com` or `gitrew.example.com` | Customer-owned workspace | Customer's Cloudflare account or celld server |

The public `/create/` page explains deployment, links to Cloudflare and VPS
instructions, and lets an owner continue at their deployed HTTPS origin. GitHub
App registration happens at `/create/` on that installation. Gitrew.com does not
receive installation credentials, create hosted tenants or store conversations.
Members sign in at the workspace address supplied by their team.

## Public site

Build with `npm run build:portal`; deploy with `wrangler.portal.jsonc`. The build
sets `NUXT_PUBLIC_SITE_MODE=portal` and disables the backend. Only the landing and
create pages are registered. Unknown paths, including workspace and API paths,
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
selected for the relevant AfterPrompt repositories. The intended GitHub Team
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
