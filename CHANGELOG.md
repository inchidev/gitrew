# Changelog

## Unreleased

## 0.6.4 — 2026-10-17

- Signed-in workspace gets the rest of the Slack feel: clickable GitHub reactions (optimistic with rollback), an online presence chip on the conversation header, and local unread dots in the sidebar; the Cmd/Ctrl-K quick switcher now works in every mode and "/" jumps to search.

## 0.6.3 — 2026-10-17

- Guest workspace behaves like Slack: Discussions categories become sidebar sections with a filter, load-more channels and a Cmd/Ctrl-K quick switcher; conversations open at the latest comments and an in-feed button walks back through history (deep history is pulled by explicit pages only). Guests reopen on their last channel; no auto-refetch, history stays put.

## 0.6.2 — 2026-10-17

- Guest browsing stops paginating forever: the read-only transport takes only the first server page of discussions and comments, so huge repositories like nuxt/nuxt open instantly instead of fetching every page in sequence; deeper history stays on GitHub.
- Slim public header: repository and public pages drop the brand lockup in favor of breadcrumbs, and the GitHub link is an icon.

## 0.6.1 — 2026-10-16

- Point the landing hero at a live workspace: the sample screenshots are gone, the hero panel and primary action open real public discussions (nuxt/nuxt, vuejs/core, nuxt/ui) with no sign-in.

## 0.6.0 — 2026-10-16

- Fill the viewport on public repository pages: the anonymous workspace takes the full page under a slim bar with brand, breadcrumb, stars, Open on GitHub and an organization/repository search with the same validation as the public index.
- Showcase guest communities on the landing: no-sign-in cards for nuxt/nuxt, vuejs/core and nuxt/ui open their read-only workspaces; navigation gains a Communities anchor.

## 0.5.0 — 2026-10-17

- Render the real workspace interface for anonymous readers at `/github/:owner/:repo`: discussion sidebar, message feed, threads and search through the shared Gitrew component, read-only with a guest sign-in call to action. No session, token or CSRF exists in the browser; the public API surface stays GET-only. The disabled-discussions notice explains the metadata cache and offers a retry.
- Resolve the request organization on every backend call so one deployment can host several ready workspaces: explicit organization wins, a single workspace keeps its old default, several without a choice get a 400 asking to specify it. Login, access checks, webhooks (dispatched by installation), logout and live revocation are per-organization with a per-workspace team override. Single-workspace deployments behave exactly as before; no storage migration.
- Record the hosted-workspaces design in `docs/hosted-workspaces.md`: shared workspaces on gitrew.com for any organization, one public GitHub App with per-organization installations, self-hosting stays the privacy option.

## 0.4.0 — 2026-10-16

- Add anonymous read-only browsing of public GitHub owners and repositories at `/github/*`: one page per request with load-more, short-lived server cache, per-visitor budgets, and identical 404s for missing and private content. The public worker answers `/api/public/*` only. Requires a `PUBLIC_GITHUB_TOKEN` secret with no permissions; see `docs/public-browsing.md`.

## 0.3.0 — 2026-10-16

- Retire the old `gitrew.inchi.dev` migration hostname and remove it from deployment and legacy defaults. Retire the inchidev workspace deployments (`inchi.gitrew.com`, `afterprompt.gitrew.com`): remove their Workers, D1 databases, storage repositories, installation configs and installation record. The repository now ships the public `gitrew.com` site plus the customer deployment template.

- Open installed workspaces directly at sign-in/chat, preserve protected destinations, and explain organization/team/chat/private-membership access with browser-bound diagnostics that do not authorize denied users.
- Remove the workspace-creation rail, member hosting prompts, duplicated toolbar name and idle presence counter; put appearance/sign-out in the account menu. Add administrator-editable workspace display names with Inchi/AfterPrompt defaults, without changing GitHub or storage identifiers.

- Simplify the public landing, link directly to installation, remove its redundant `/create/` page, and replace the illustrative chat with real responsive product screenshots using sample content. Preserve setup on installed workspaces and document repository/App creation.

- Resolve the UUID and nested esbuild dependency alerts with scoped, validated overrides; document the remaining unpatched braces/node-forge build dependencies and their assessed runtime boundary.

- Require the `gitrew-` prefix for chat/vault repository names during setup, and recognize named workspace storage when listing workspaces, conversation sources and project repositories.

- Remove hardcoded inchidev/Inchi/AfterPrompt references from client fallbacks, runtime config and maintainer scripts. Deployments resolve their configured workspace or stay on entry; installer scripts take the organization as an argument.

## 0.2.0 — 2026-10-15

- Restrict workspace entry and authenticated API, realtime, huddle and push operations by GitHub Team; preserve organization-owner administration and team-based repository grants.
- Support coordinated domain migration through APP_ORIGIN, redirect the old inchidev frontend, and add independent inchi/AfterPrompt deployment configurations.
- Configure separate RealtimeKit voice huddles for the AfterPrompt installation and explain team grants during onboarding.

- Separate the public gitrew.com landing and installation guide from independent workspace deployments at inchi.gitrew.com and afterprompt.gitrew.com.

- Provide 192px/512px PNG, maskable and Apple touch icons so Chrome recognizes Gitrew as installable; retain the existing PWA identity and start URL.
- Respect device safe areas in chat, channels, threads, sign-in, setup and the landing page; match browser chrome colors to the active page and light/dark theme.
- Open/close mobile channel navigation with horizontal swipes while preserving scrolling, editing and OS edge gestures.
- Document mobile GitHub web OAuth behavior and add Chromium/WebKit mobile regressions to CI.

## 0.1.1 — 2026-10-15

- Update the development compiler to TypeScript 6.0.3 after the full CI suite passed. TypeScript 7 remains deferred because it is incompatible with the current Vue typechecker; Node declarations remain on Node 24.
- Refresh the lockfile, removing unused Vercel dependency entries. Application behavior and the verification limits below remain the same.

## 0.1.0 — 2026-10-15

First Gitrew release: GitHub organization chat on Cloudflare, with a local celld deployment path.

### Team communication

- Channels, threads, private groups and DMs backed by GitHub Discussions, with access checks for private conversations.
- WebSocket updates, presence and typing through the LiveHub Durable Object; periodic refresh remains a fallback.
- Optional Web Push subscriptions per conversation, with generic notification text and access checks before delivery.
- Optional voice huddles using Cloudflare RealtimeKit or an external LiveKit server. Calls join muted with explicit microphone controls.
- Concurrent private reads while private writes remain serialized.
- Repository issue/PR browsing and links to organization Project boards.

### Installation and operations

- A new Gitrew repository and brand, GitHub-first landing, provider cards and research links.
- Independent, organization-owned GitHub Apps; encrypted backend credentials and sessions, PKCE, CSRF protection and signed webhooks.
- Cloudflare Worker, D1 and SQLite Durable Object configuration; local Docker Compose packaging with celld 0.6.2 and persistent state.
- Guides for setup, usage, huddles, notifications, upgrades, backups and recovery.
- Repository security settings, weekly Dependabot updates, CODEOWNERS and protected-main PR/CI policy.
- GitHub Actions updates for checkout and the retired manual Pages workflow. Node types remain aligned with Node 24; TypeScript 7 is deferred because it breaks the current Vue typechecker.

### Scope and verification

- Cloudflare and celld are the runtime targets; Vercel support was removed. Gitea, GitLab and agent/Copilot handoffs are deferred.
- The hero still uses a labeled illustrative preview; a real product screenshot is planned.
- Verified with 56 unit/runtime tests, typechecking, 18 browser tests, Worker build/dry run, local Docker startup/restart and live Cloudflare checks. Live checks include WebSocket presence and muted RealtimeKit join/disconnect.
- Two-person audio, background push delivery, physical-device PWA behavior and a public VPS/Coolify deployment remain unverified. Web Push delivery is best effort. The celld image uses compatibility/dev mode; review its durability requirements before public hosting.
- Existing dependency advisories remain; see the GitHub dependency alerts. This release does not claim a clean vulnerability audit.
