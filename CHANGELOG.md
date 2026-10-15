# Changelog

## Unreleased

- Restrict workspace entry and authenticated API, realtime, huddle and push operations by GitHub Team; preserve organization-owner administration and team-based repository grants.
- Support coordinated domain migration through APP_ORIGIN, redirect the old inchidev frontend, and add independent inchi/AfterPrompt deployment configurations.

- Separate the public gitrew.com landing and installation guide from independent workspace deployments; document our planned inchi/AfterPrompt domains and the pending team access boundary.

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
