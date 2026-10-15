# Product site and workspace installations

Gitrew uses one codebase with two deployment modes.

| Address | Purpose | Infrastructure |
| --- | --- | --- |
| `gitrew.com` | Public landing and `/create/` installation guide | Static assets; no GitHub credentials, D1 or workspace API |
| `inchi.gitrew.com` | Planned address for our inchidev workspace | Its own Worker, D1, LiveHub and GitHub App |
| `afterprompt.gitrew.com` | Planned workspace for the AfterPrompt team | Separate Worker, D1, LiveHub, App and chat/vault repositories |
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
organization need distinct chat/vault repository names.

## Our workspace rollout

The existing inchidev workspace is currently at `https://gitrew.inchi.dev`.
`inchi.gitrew.com` is its target address, not a second copy of its conversations.
Before moving it, update the GitHub App's homepage, OAuth callback, setup/manifest
return URL and webhook endpoint together with the backend's configured origin.
Old-origin session cookies and installed PWAs do not transfer to a new origin:
members sign in and install again; push subscriptions must be registered again.
Retain the old endpoint until the new login and webhook path are verified.

AfterPrompt will use `afterprompt-chat` and `afterprompt-vault`, with App access
selected for the relevant AfterPrompt repositories. The intended GitHub Team
slug is `afterprompt`; the team has not yet been created.

**Team isolation is pending implementation.** Current Gitrew grants shared-chat
access to active organization members on sign-in. Selecting source repositories
or creating a GitHub Team alone does not restrict workspace entry. Add a
fail-closed team membership policy to every authenticated workspace operation,
including realtime, push and huddles, and test removal before launching a
team-only workspace. Do not give the ordinary team vault repository access.
Organization owners and workspace operators remain trusted administrators.

The same policy can restrict the main inchi workspace if project members should
not enter it. Organization base permissions remain None; teams receive explicit
access to their project repositories. Public source repositories remain public.

## Future hosted service

A shared service that provisions workspaces on demand under `*.gitrew.com` would
need a control plane, tenant authorization, provisioning, lifecycle management,
quotas and an operating/billing model. The public landing and installer do not
provide that service today. Our two subdomains are installations we operate.
