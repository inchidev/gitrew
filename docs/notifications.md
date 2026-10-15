# Web Push notifications

Notifications are opt in per browser and conversation. Delivery works through the browser's push service even when Gitrew is closed, subject to platform support and permission. Notifications contain generic text and an authenticated conversation link; they do not include message text, names or private channel titles.

## Installation

```sh
node scripts/generate-vapid.mjs
```

This writes a new pair to ignored `.gitrew-setup/vapid.env` with mode0600 and refuses to overwrite an existing pair. Set `VAPID_SUBJECT` to your real contact email or HTTPS contact URL.

Configure the following Worker variables/secrets, or copy them into the private VPS `.env`:

```dotenv
VAPID_PUBLIC_KEY=generated-public-key
VAPID_PRIVATE_KEY=generated-private-key
VAPID_SUBJECT=mailto:owner@example.com
```

The private key must be a Worker secret. Retain the same pair across upgrades; changing it requires browsers to resubscribe. It is distinct from the deployment `SETUP_TOKEN`.

Enable `discussion_comment` App webhooks for public-channel activity and changes made in GitHub. Private sends also schedule notifications directly, deduplicated with webhook delivery by comment ID. Webhook retries are not a guaranteed notification queue: a transient delivery failure may lose a notification; conversation history remains in GitHub.

## User controls and security

Use the conversation bell to enable/disable notifications. The service worker does not cache authenticated pages, APIs or messages. Followed subscriptions are encrypted in D1 and bound to a Gitrew session. Before each delivery the backend checks the session and current organization/conversation access. Expired/revoked sessions and unavailable subscriptions are pruned. Sign-out removes that session's follows. After signing in again, toggle the bell off/on to renew them.

Supported push gateways are explicitly allowed to prevent arbitrary outbound requests. Current gateway allowlist: Chrome FCM, Firefox Mozilla Push and Apple Web Push. Other browser gateways need an explicit reviewed addition.

On iPhone/iPad, Web Push requires an installed Home Screen web app and compatible OS/browser support. The repo includes a standalone web manifest and push service worker. Home Screen installation and background delivery still need real-device validation; no offline conversation cache is included. Notification permission can only be granted by the user. Local HTTP on localhost is suitable for limited development; public deployments require HTTPS.
