# Gitrew direction

Status reconciled on 2026-10-16. The priority is reliable everyday GitHub team chat, with live acceptance testing of the implemented experience.

## Shipped on main

- Channels, threads, private groups and DMs backed by GitHub Discussions; authorized WebSocket updates, presence and typing; opt-in Web Push; voice-first RealtimeKit or LiveKit huddles. GitHub remains the conversation store.
- Independent public landing/installer at `gitrew.com`, plus workspaces at `inchi.gitrew.com` and `afterprompt.gitrew.com`. Each workspace has its own App, Worker, D1, LiveHub, storage and optional media/push credentials, restricted to its GitHub Team. Customers use their own infrastructure and domain.
- Manifest, canonical/maskable/Apple icons, safe areas, theme colors and mobile channel swipes. Basic iPhone installation/launch and automated Chromium/WebKit checks are verified; full physical-device acceptance remains open.
- Required `gitrew-` names for new chat/vault storage and recognition of named storage in workspace, channel and project selectors ([PR #25](https://github.com/inchidev/gitrew/pull/25)). Existing production repository references already match their private prefixed repositories.

All three Cloudflare deployments were verified after the prefix merge: successful builds of the same main commit, healthy workspace endpoints, anonymous sessions rejected, public-site API paths absent and the old inchi domain redirect intact. Feature configuration does not establish two-person audio, private delivery or background push. See the dated [installation record](docs/inchidev-install.md).

The latest pinned source release is [v0.2.0](https://github.com/inchidev/gitrew/releases/tag/v0.2.0); the prefix and dependency fixes are newer on main and are listed in `CHANGELOG.md` under Unreleased.

## Remaining work

| Work | Completion evidence | Tracking |
| --- | --- | --- |
| Two-member team-chat acceptance on both maintained workspaces | Allowed/wrong-team access, private/DM isolation, live delivery and reconnect, membership revocation, two-person audio and provider cleanup | [#1](https://github.com/inchidev/gitrew/issues/1) |
| Installed PWA and background notifications | Physical iOS/macOS/Android icons/layout/keyboard/gestures, standalone OAuth/session/deep links, opt-in/out and actual background push | [#2](https://github.com/inchidev/gitrew/issues/2) |
| Encryption-key separation and rotation | Separate purpose keys, versioned migration, tested rotation and documented recovery | [#4](https://github.com/inchidev/gitrew/issues/4) |
| Remaining upstream dependency alerts | UUID/esbuild fixes and exposure assessment are documented; update braces/node-forge when patched upstream releases are available and recheck GitHub alerts | [#26](https://github.com/inchidev/gitrew/issues/26) · [Assessment](docs/dependency-security.md) |
| Installation recovery and upgrades | Isolated backup/restore drill covering secrets, D1/DO and GitHub conversation state, with tested upgrade/rollback limits | [#27](https://github.com/inchidev/gitrew/issues/27) |
| Public celld/Coolify installation | Supported production runtime/durability, final HTTPS OAuth, member/realtime checks, persistent restart and restore/upgrade proof | [#28](https://github.com/inchidev/gitrew/issues/28) |
| Real landing screenshot | Representative shipped UI with consented/sample content, no private data, readable responsive asset | [#29](https://github.com/inchidev/gitrew/issues/29) |

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
