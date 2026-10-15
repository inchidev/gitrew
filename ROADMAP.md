# Gitrew direction

## Current priority: everyday GitHub team chat

Finish the Slack-like experience around a GitHub organization: channels, threads, private groups, DMs, live updates, presence, typing, notifications and voice huddles. Keep source repositories distinct from conversation storage. Validate privacy and reconnect behavior with two real organization members.

The realtime implementation uses a workspace Durable Object for authorized room subscriptions and live signals, with signed GitHub webhooks. GitHub remains the conversation store. Add a durable message cache only after designing deletion, replay/order, reconciliation and permission changes.

Huddles use the installation's own Cloudflare RealtimeKit credentials or LiveKit server; API keys stay server side. Web Push is opt in. Media and background push require separate live verification.

## Hosting and documentation

Focus on Cloudflare and celld: Worker + D1 + Durable Objects. Vercel support is removed. Keep installation, user, architecture, notifications, media, backup/recovery and upgrade documentation together in [docs](docs/README.md). Local Docker Compose is a compatibility test; prove a public celld/Coolify deployment before calling that production ready.

Replace the landing illustration with a real product screenshot after the chat UI reaches a representative state. Use consented/sample content and keep private data out of public assets.

## Deferred

- Conversation → issue → agent → PR → review. Existing issue browsing/creation and Project links remain available; new handoffs and Copilot execution wait.
- Gitea and GitLab integrations. Both wait until the GitHub communication experience is complete. Bitbucket stays outside scope.
- Native mobile distribution, mobile background calls, full installable PWA and advanced call features need their own validation.

## Watching

- [Cursor Origin](https://cursor.com/docs/origin) and [cloud agents](https://cursor.com/docs/cloud-agent).
- [Claude / Anthropic Scion](https://www.anthropic.com/engineering/redesigning-source-control): agent-scale source control; Scion is internal research.
- [Cloudflare Git platform direction](https://blog.cloudflare.com/next-git-platform-on-cloudflare/): Artifacts, Sandboxes and AI Gateway.
- [GitOrange](https://github.com/choyiny/gitorange), [Weft](https://github.com/celador/weft), [AgentBranches](https://github.com/alexeygrigorev/cloudflare-agent-git).
- [Anycord](https://github.com/inchidev/anycord), [Discoflare](https://github.com/vnmtvlv/discoflare): communication and self-hosting references.

Watching is not an integration commitment. Never send private context to an issue, agent or third party automatically.
