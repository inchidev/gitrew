# Gitrew documentation

Gitrew is a GitHub organization workspace for channels, threads, private groups and DMs. The current priority is everyday team communication: live updates, presence, typing, notifications and voice huddles. Agent workflows, Gitea and GitLab are deferred.

## Start here

- [Product site and workspaces](deployments.md): gitrew.com, our workspace subdomains and customer-owned domains.

- [User guide](usage.md): sign in, conversations, threads, notifications, huddles and issues.
- [Mobile / PWA](mobile.md): safe areas, swipe navigation, mobile GitHub sign-in and device checks.
- [Cloudflare installation](cloudflare-backend.md): Worker, D1, Durable Object and your own GitHub App.
- [VPS / Coolify installation](vps.md): Docker Compose, HTTPS, storage and operational checks.
- [Local celld instructions and verification](celld.md).
- [Huddles](huddles.md): your RealtimeKit credentials or LiveKit server.
- [Notifications](notifications.md): Web Push keys, browser permission and privacy.
- [Operations](operations.md): updates, backups, recovery and troubleshooting.
- [Releases](releases.md): pinned source downloads, verification and maintainer procedure.
- [Contributing](contributing.md): pull requests, required checks and branch policy.
- [GitHub security settings](github-security.md): scanning, push protection and Dependabot.
- [Architecture and security](architecture.md).
- [Realtime contract](realtime.md): event flow, authorization and fallback behavior.
- [inchidev installation record](inchidev-install.md): dated live verification, distinct from local tests.
- [Roadmap](../ROADMAP.md).

Cloudflare is deployed; celld is the alternative runtime target with a locally verified compatibility example. Public production celld/Coolify hosting remains [open work](https://github.com/inchidev/gitrew/issues/28). Vercel support was removed because this version relies on Durable Objects. The old static/Actions installation is retired. See the [roadmap](../ROADMAP.md) for shipped behavior and the remaining acceptance work.
