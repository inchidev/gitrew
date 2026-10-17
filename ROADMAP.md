# Gitrew direction

Status reconciled on 2026-10-16. The priority is reliable everyday GitHub team chat, with live acceptance testing of the implemented experience.

## Shipped on main

- Channels, threads, private groups and DMs backed by GitHub Discussions; authorized WebSocket updates, presence and typing; opt-in Web Push; voice-first RealtimeKit or LiveKit huddles. GitHub remains the conversation store.
- Independent public landing/installer at `gitrew.com`. Customer workspaces deploy on their own infrastructure and domain, each with its own App, Worker, D1, LiveHub, storage and optional media/push credentials, optionally restricted to a GitHub Team.
- Manifest, canonical/maskable/Apple icons, safe areas, theme colors and mobile channel swipes. Basic iPhone installation/launch and automated Chromium/WebKit checks are verified; full physical-device acceptance remains open.
- Required `gitrew-` names for new chat/vault storage and recognition of named storage in workspace, channel and project selectors ([PR #25](https://github.com/inchidev/gitrew/pull/25)). Existing production repository references already match their private prefixed repositories.

- A shorter landing with direct installation links and real light/dark desktop/mobile product screenshots using sample conversations ([#29](https://github.com/inchidev/gitrew/issues/29)). The public `/create/` guide is removed; installed workspace setup is preserved.

- Direct workspace entry, own-identity access diagnostics and a member-focused chat UI: no marketing/workspace creation or hosting prompts on working domains; persistent administrator-editable names and account appearance controls. Each installation keeps its existing organization, App, storage and access policy.

The public deployment was verified after the prefix merge: successful build of the same main commit, healthy endpoints, anonymous sessions rejected and public-site API paths absent. Feature configuration does not establish two-person audio, private delivery or background push. The former inchidev workspace deployments (`inchi.gitrew.com`, `afterprompt.gitrew.com`) were retired on 2026-10-16: their Workers, D1 databases, storage repositories and installation record were removed.

The latest pinned source release is [v0.6.4](https://github.com/inchidev/gitrew/releases/tag/v0.6.4).


## Remaining work

| Work | Completion evidence | Tracking |
| --- | --- | --- |
| Two-member team-chat acceptance on a deployed workspace | Allowed/wrong-team access, private/DM isolation, live delivery and reconnect, membership revocation, two-person audio and provider cleanup | [#1](https://github.com/inchidev/gitrew/issues/1) |
| Installed PWA and background notifications | Physical iOS/macOS/Android icons/layout/keyboard/gestures, standalone OAuth/session/deep links, opt-in/out and actual background push | [#2](https://github.com/inchidev/gitrew/issues/2) |
| Encryption-key separation and rotation | Separate purpose keys, versioned migration, tested rotation and documented recovery | [#4](https://github.com/inchidev/gitrew/issues/4) |
| Remaining upstream dependency alerts | UUID/esbuild fixes and exposure assessment are documented; update braces/node-forge when patched upstream releases are available and recheck GitHub alerts | [#26](https://github.com/inchidev/gitrew/issues/26) · [Assessment](docs/dependency-security.md) |
| Installation recovery and upgrades | Isolated backup/restore drill covering secrets, D1/DO and GitHub conversation state, with tested upgrade/rollback limits and a documented update path for customer-owned source copies | [#27](https://github.com/inchidev/gitrew/issues/27) |
| Public celld/Coolify installation | Supported production runtime/durability, final HTTPS OAuth, member/realtime checks, persistent restart and restore/upgrade proof | [#28](https://github.com/inchidev/gitrew/issues/28) |

Cloudflare is deployed. celld remains a local compatibility path until its public-hosting acceptance is completed; the current dev-mode Compose example is not production proof. Keep installation, user, architecture, notifications, media, backup/recovery and upgrade documentation together in [docs](docs/README.md). Vercel support is removed.

## Deferred

- Conversation → issue → agent → PR → review. Existing issue browsing/creation and Project links remain available; new handoffs and Copilot execution wait.
- Gitea and GitLab integrations wait until the GitHub communication experience is complete. Bitbucket stays outside scope.
- Native mobile/App Store distribution, offline features, mobile background calls and advanced call features are outside the current online-only PWA milestone.
- A durable conversation cache needs a design for deletion, replay/order, reconciliation and permission changes before implementation.
- Shared hosted tenant provisioning needs a separate control plane, authorization, lifecycle, quotas and operating model. Our two workspaces are independent installations, not that service.

## Watching

- [Cursor Origin](https://cursor.com/docs/origin) and [cloud agents](https://cursor.com/docs/cloud-agent).
- [Claude / Anthropic Scion](https://www.anthropic.com/engineering/redesigning-source-control): agent-scale source control; Scion is internal research.
- [Cloudflare Git platform direction](https://blog.cloudflare.com/next-git-platform-on-cloudflare/): Artifacts, Sandboxes and AI Gateway.
- [GitOrange](https://github.com/choyiny/gitorange), [Weft](https://github.com/celador/weft), [AgentBranches](https://github.com/alexeygrigorev/cloudflare-agent-git).
- [Anycord](https://github.com/inchidev/anycord), [Discoflare](https://github.com/vnmtvlv/discoflare): communication and self-hosting references.

Watching is not an integration commitment. Never send private context to an issue, agent or third party automatically.
