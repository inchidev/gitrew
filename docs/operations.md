# Operations

## Keep and back up

- The deployed source commit, final HTTPS origin, GitHub App identity and installation settings.
- `SETUP_TOKEN`: required to decrypt stored credentials and sessions. Do not rotate it casually.
- Cloudflare D1 export and applicable Durable Object state; use the provider's documented export/recovery tools.
- celld's complete persistent state volume, including `.celld/setup-token`. Stop the container before taking a filesystem backup so SQLite files form a consistent snapshot.
- Optional VAPID pair and media credentials in your secret manager.
- GitHub `gitrew-chat` / `gitrew-vault` repositories and Discussions are separate from D1. A Git clone alone does not back up Discussions; use GitHub APIs/export tooling if you need an independent archive.

Treat backups as private. D1/DO contain operational records, credentials or access metadata; deleting a local volume can make the installation unrecoverable.

## Upgrade

Review the change and its migrations, back up state, then deploy the same installation with the same origin and secrets. Cloudflare uses `npm run deploy`; the maintained inchidev copy uses `wrangler.inchidev.jsonc`. celld uses `docker --context colima compose up --build -d` for the local example; on your VPS use its local Docker daemon. Do not run `docker compose down -v` during upgrades.

This version adds `LiveHub` with a SQLite DO migration and encrypted push subscription tables created on use. It does not move conversation history from GitHub. Leave active huddles before changing provider/account credentials. Durable Object rollback/deletion needs its own provider recovery plan; a code rollback does not undo state migrations.

## Troubleshooting

- `/health` checks the HTTP runtime; `/api/config` reports public setup and configured feature flags. Neither proves media/push delivery.
- Missing live updates: check the `LIVE` binding, GitHub event subscriptions, signed webhook deliveries and WebSocket upgrade through the reverse proxy. Polling remains the fallback.
- Private operations fail: check active GitHub organization membership, organization base permission None and administrator-only vault access.
- Huddles unavailable: check the selected provider, credentials/preset, microphone permission and provider active sessions. Failed cleanup must be resolved at the provider.
- No notifications: check VAPID configuration, browser permission, followed conversation, active Gitrew session and App webhooks. Test with a second account; your own sends are suppressed when the author is known.
- Never log cookies, setup keys, participant tokens or OAuth/WebSocket ticket query strings. Cloudflare config enables query redaction.

## Before claiming production readiness

Verify fresh installation at the final HTTPS domain, two-user access isolation, live channel/DM delivery, reconnect/revocation, microphone/audio in two browsers, background push, restart, backup/restore and upgrade. Record what was actually verified in the installation record. Mocked APIs and localhost health do not establish those results.

The complete installation backup/restore and upgrade drill remains tracked in [#27](https://github.com/inchidev/gitrew/issues/27). Encryption-key separation and rotation remain [#4](https://github.com/inchidev/gitrew/issues/4); keep the existing setup key until a tested rotation procedure ships.
