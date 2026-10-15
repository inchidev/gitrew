# Live communication

## Event flow

- Gitrew saves a message to GitHub first. A successful mutation tells the workspace LiveHub to invalidate clients' authorized history immediately.
- A signed GitHub `discussion` or `discussion_comment` webhook also invalidates the relevant conversation. This covers changes made directly in GitHub.
- The Nuxt client coalesces invalidations, then reads through the existing authorized backend. GitHub remains the conversation store; this iteration does not add a persistent D1 message mirror.
- A hibernating Durable Object owns room subscriptions, connected presence and ephemeral typing. One object coordinates an organization; events are filtered to the subscribed room. Private webhook bodies/titles and message content are never broadcast.
- A connected client polls history only every five minutes as recovery. Without a live connection it falls back to the existing 20-second public / 120-second private polling. Reconnect refreshes history. Webhooks are asynchronous; no fixed delivery SLA is promised.

D1 is not a WebSocket server. A future message cache needs webhook ordering, replay/deduplication, deletion handling, reconciliation and authorization checks; reducing polling alone does not establish these guarantees.

## Authorization

A CSRF-protected POST requests a single-use socket ticket. The backend checks current organization membership and the actual Discussion's chat repository, or the private conversation participant list. Consuming the ticket is session bound, same origin and rechecks room access. No GitHub token is sent to the browser.

Socket attachments contain identity, session ID, room and a four-minute authorization lease. Clients reconnect before expiration to reauthorize. Sign-out, GitHub authorization revocation and Gitrew member removal close matching sockets and end media leases. GitHub membership events also revoke affected live connections. External repository permission changes without an applicable webhook may take until the next authorization cycle; ordinary history requests always enforce their existing access checks.

Typing accepts only a small validated event and is throttled. A client cannot set its sender identity or choose another channel over the socket. Presence and typing stay within the authorized conversation. No typing history is saved. Read-only vault operations retain the full access audit but run concurrently, so multiple authorized clients can refresh or receive push after the same event. Private writes remain serialized.

## Existing GitHub Apps

New App manifests request `discussion`, `discussion_comment`, `membership`, `member` and `organization` webhook events. Existing installations must enable these subscriptions in GitHub App settings. Keep the endpoint `/api/webhooks`, its current signing secret and Discussions write / organization Members read permissions. Do not recreate the App or rotate the deployment setup key.

Provider: [Cloudflare hibernating WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/). Event contract: [GitHub webhook events](https://docs.github.com/en/webhooks/webhook-events-and-payloads#discussion_comment).
