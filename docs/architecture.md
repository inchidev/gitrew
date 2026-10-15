# Architecture

This is the recommended frontend/API deployment. See the provider guides for
[Cloudflare](cloudflare-backend.md) and [celld](celld.md), or the separate
[retired static/Actions architecture](legacy-architecture.md).

## Ownership and runtime

An organization is a workspace. An independent deployment includes its frontend,
API, encrypted metadata storage and organization-owned GitHub App. Its operator
controls the deployed source and credentials. It does not call a Gitrew-operated
authentication service. Cloudflare serves static Nuxt assets and API routes from
one Worker, with D1 and a hibernating LiveHub Durable Object. celld runs the same Worker-compatible backend, D1 binding and Durable Object on the self-hosting path. Vercel support is removed. See [realtime](realtime.md), [huddles](huddles.md) and [notifications](notifications.md).

```text
Browser (Nuxt SPA)
  │ same-origin HTTPS, session cookie + CSRF proof
  ▼
Your API
  ├── encrypted D1: App keys, OAuth state, sessions, setup checkpoints
  ├── user's GitHub token → permitted ordinary GitHub operations
  └── scoped App installation token → private gitrew-vault
                                       workspace + conversation ACL checks
```

Workspace-wide channels are Discussions in the selected private chat repository (default
`ORG/gitrew-chat`). All managed private channels and DMs are Discussions in one
administrator-only vault (default `ORG/gitrew-vault`). Names are chosen in setup,
validated and fixed in the provisioning checkpoint. Separate deployments may use
one organization with different repositories; each deployment still supports
one workspace per organization. Both names are preflighted before creating either
repository. Chat access is granted separately from the vault: active organization
members receive read access to the chat repository on sign-in. The grant uses a
short-lived installation token scoped to the chat repository with Administration
write permission, revoked afterward. Existing access is retained without a new grant.
The OSS source repository holds client/backend code, not customer conversations.
Metadata storage contains no persistent conversation mirror.

## Registration and identity

The operator supplies a random setup/encryption key of at least 32 characters
and opens `/create/`. Browser-bound, expiring state protects GitHub App manifest
registration. GitHub returns the generated credentials directly to the API.
The owner approves authorization and installation, and the API creates the two
repositories. Checkpoints survive reloads; provisioning refuses to overwrite
unrelated repositories. No shared PAT, auth mailbox or Device Flow is required.

OAuth uses PKCE, single-use state bound to the browser and a fixed callback
origin. The server exchanges and refreshes GitHub user credentials. A Secure,
HttpOnly, SameSite=Lax cookie identifies a session; storage holds a hashed session
identifier and encrypted credentials. The client receives identity and a CSRF
proof, not a GitHub token. Writes require the proof and exact site origin.
Authenticated requests verify GitHub identity; logout deletes the session and
clears frontend remote caches. Signed GitHub authorization revocation webhooks
invalidate the corresponding sessions. The webhook endpoint is an ordinary API
route on your Worker/function, without an Actions queue.

`SETUP_TOKEN` protects stored credentials, not just the first setup page. Keep a
protected backup and retain it across deployments. Replacing it makes existing
encrypted configuration unreadable. Choose the final production domain before
registration; changing domains requires coordinated App and stored-origin changes.

## Membership and private operations

The vault directory records members and administrators by immutable GitHub ID.
Closed workspaces require current GitHub organization membership. The UI's
**Workspace members** action lets an administrator add an already active
organization member, or remove a Gitrew member. The backend verifies that a closed
workspace invitee has accepted their organization invitation and matches the
looked-up account ID. This sends no GitHub invitation and grants no vault repository
access. New members do not automatically join existing private conversations.

Only declared workspace administrators may have vault repository access,
including inherited grants. Organization base permission must be None. Private
operations audit these grants and fail closed on unexpected readers. Current
GitHub organization roles are checked: a former organization owner cannot keep
workspace administrator authority solely through an old directory entry.

For each private operation the API mints a short-lived, repository-scoped App
installation token. It checks current workspace membership and the conversation's
participant list before returning data or applying writes. The token never reaches
the browser and is revoked afterward, including on operation failure. Guessed
conversation or thread IDs do not bypass permissions. Workspace administrators
can create private channels; registered members can create DMs with exactly one
other member. Canonical participant-pair IDs reuse an existing DM. Removal blocks
future private operations, but already received content cannot be recalled.

The sandbox and independent deployments both require active organization
membership. Legacy open-registration flags cannot bypass backend checks or enable
outsider joins. A public GitHub App only controls who can install/authorize the
App; every workspace data repository remains private. Organization-wide channels
use the user's GitHub token after the separate chat read-access grant. Private
channels and DMs use the vault API and participant checks. Removing a Gitrew member
blocks private conversations; organization-wide access follows GitHub organization
membership and repository grants.

Private Discussions and message records attribute GitHub mutations to the App;
Gitrew renders the authenticated sender recorded by the API. Per-workspace locks
serialize private writes, and retry nonces deduplicate private sends. A failed
send retains its nonce within the tab. There is no persistent offline outbox.

## Storage and operator trust

D1 encrypts App credentials and session tokens with AES-GCM. It also stores expiring OAuth state, setup checkpoints and operational locks/rate counters. Optional push subscriptions are encrypted and session bound. The Durable Object stores media meeting/participant leases and socket attachments; it coordinates live invalidations, presence and typing. Conversation history remains in GitHub; there is no persistent D1 message mirror.

This is not E2EE. GitHub, workspace administrators and the backend operator can
read private content. A frontend operator can alter the JavaScript users receive;
keeping tokens server-side does not remove that trust. Independent deployment
moves both frontend/backend operation and App ownership to the organization.
An optionally shared deployment remains operated by its maintainers. The maintained inchidev installation is closed to active organization members. Other GitHub Apps may
have independent repository access; organization owners must manage those grants.

## Client behavior and validation

Nuxt runs with `ssr:false`; `/`, `/login` and `/create/` are static entry points.
Workspace, channel and DM deep links use an SPA fallback and preserve their local
destination through sign-in. There is no standalone demo page. The landing's
illustrative preview makes no authenticated API requests.

Vue Query holds remote history in memory. LocalStorage contains account-scoped
conversation/thread drafts and preferences; these remain after logout. Private
history is not persisted. Connected clients receive WebSocket invalidations and recover with a five-minute refresh. Without realtime, private messages refresh every two minutes or manually; workspace messages refresh every20 seconds while visible. Search covers loaded history. Presence/typing are conversation scoped. Optional Web Push and RealtimeKit/LiveKit voice huddles need installation credentials and live verification.
workspace messages refresh every 20 seconds while visible. Search covers loaded
history. There is no presence, typing, push or WebSocket service.

Unit tests use simulated GitHub APIs; runtime tests use workerd and local D1/DO. Browser tests mock API responses. These checks do not establish live GitHub approvals, media delivery, background push or fresh-team installation. Provider guides keep live verification records separate from automated checks.
