# Legacy static/Actions architecture

> Historical reference. Superseded on 2026-10-15: all workspace repositories must
> be private; shared channels are organization-wide. New static/Actions installs
> are disabled because they require a public auth mailbox. Use the backend setup.


> This document describes the legacy static/Actions mode. For the recommended
> backend and guided owner-controlled App setup, see
> [current architecture](architecture.md).

## Runtime

```text
Static Nuxt client on GitHub Pages
  ├── GitHub user token → public Discussions / Issues / Projects
  └── encrypted requests → public gitrew-auth issues
                                │ issue-opened workflow
                           GitHub Actions
                                ├── Device Flow → encrypted user session
                                └── workspace App → private gitrew-vault
                                      membership + conversation checks
```

An organization is the workspace. Public channels can be collected from its
Discussions repositories. Every managed private channel and DM resides in the
single `ORG/gitrew-vault`. The public source/template repository contains client
code, not a workspace's conversations. Optional `gitrew-client` is a separate
team-owned Pages deployment.

## Identity and mailbox

The browser creates an ephemeral P-256 ECDH key pair and random request ID.
Public configuration contains the Action's ECDH public key and App client ID.
AES-256-GCM authenticates each envelope with the request ID as additional data;
replies must use the configured server key. Keys and credentials never enter
issue URLs in plaintext. The request includes only its public key, request ID,
time, operation class and, for vault operations, encrypted payload.

The GitHub issue event supplies identity: `issue.user.id` must match `sender.id`.
User-submitted author fields are ignored. The Action rejects stale requests and
misrouted vault titles. Device Flow does not need a client secret. Before releasing
a token, the Action requests `/user` with it and checks the immutable GitHub ID
against the original issue author. Refresh credentials are discarded. Only
expiring sessions of at most eight hours are accepted.

Access tokens and pending browser private keys stay in sessionStorage; logout
clears credentials and query caches. Workspace switching changes the mailbox
and requires authorization for that App. Any script delivered by the client
origin can read its session. A team-owned, reviewed client reduces dependence
on the shared site's operator but does not remove GitHub as a trust boundary.

The public mailbox exposes GitHub usernames, timestamps, request classes, lengths
and encrypted archives. This protocol has no forward secrecy: compromise of the
long-lived mailbox private key can decrypt retained envelopes, including old
session tokens (normally already expired). Protect and rotate keys deliberately;
rotation invalidates in-flight requests. Do not describe this as E2EE.

## Vault authorization

The Action signs an App JWT and mints a short-lived installation token scoped
only to `gitrew-vault`, with Contents and Discussions write permissions. It checks
that the repository is private, reads `.gitrew/members.json`, and audits all
repository collaborators, including inherited organization/team grants. It
fails closed if a reader is not a declared workspace administrator. Installation
tokens are revoked after the operation and never returned to a browser.

GitHub organization owners inherently administer repositories. Organization
base permissions must be None; members and teams receive no vault grants.
Administrators control the repository, workflow code and App secrets and can
read every conversation, including DMs. Other installed Apps may have access
independently; administrators must restrict installations as well as human grants.

The member directory uses immutable GitHub IDs. An administrator adds/removes
Gitrew members without granting them vault repository access. Each request checks
current membership, then conversation membership. Administrators may create
private channels. A sandbox can explicitly enable `memberPrivateChannels` in
its private member directory to let registered members create private groups. Members may create DMs with exactly one other current member;
a canonical sorted pair ID reuses an existing DM. Removed members lose future
access even if old conversation metadata still includes their ID. Already
received content cannot be recalled.

Each vault Discussion stores conversation metadata. Each comment stores one
message record with the authenticated sender and optional parent ID. GitHub
attributes the underlying mutation to the workspace App; Gitrew renders the
verified sender from the record. Guessed conversation/thread IDs do not bypass
checks. All pages are fetched; malformed or incomplete scans fail. Responses
are encrypted in chunks, bounded to 200 chunks of 5,000 characters.

Vault jobs serialize per auth repository, with up to 100 queued runs. Sends use
request IDs for deduplication. Browser retries of the same failed draft retain
that ID within the tab; closing/reloading loses this retry memory. There is no
offline outbox. Public mutations are not blindly retried.

## Installer and ownership

A global Creator App is a provisioning tool, separate from the workspace App.
Its administrator user token can create repositories, configure Actions Secrets
and workflows, and optionally publish Pages. The administrator must own the
organization. Reserved names are preflighted; unrelated repositories are never
overwritten. Installation markers allow retries for the same setup. Existing
member directories are preserved on retry.

The workspace App is created through GitHub's manifest flow with a one-time,
random registration state. Its private key and generated mailbox key are saved
in the team's auth repository Actions Secrets. Browser recovery material remains
in sessionStorage during an interrupted registration. It is accepted for thirty
minutes and removed on completion or when an expired retry is detected; closing
the tab also clears it. A local CLI offers the same bootstrap using `gh`
and a temporary loopback callback. It does not create a hosted service.

The default workspace App is private: GitHub permits only members of its owning
organization to authorize it. Gitrew membership is an additional conversation
access check, not an invitation to the GitHub organization. Paid organization
plans may charge for those organization seats; private-vault separation does
not waive GitHub billing. See [App visibility](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/making-a-github-app-public-or-private).

Enable Device Flow manually and install the workspace App on `gitrew-chat`,
`gitrew-auth` and `gitrew-vault`. Revoke the Creator's access after setup if no
longer needed. A template is an independent copy, not a fork with automatic
updates; Discussion data and Secrets are not copied.

## Client behavior and limits

Nuxt runs with `ssr:false`; Pages serves static output. Public channels load
independently of the queued vault. Private lists/messages refresh every two
minutes while visible; public messages every twenty seconds. Search covers the
loaded conversation. No presence, typing, push transport or websocket service
is claimed. Projects links and Issues are available through the user's GitHub
permissions, not through the vault's installation token.

Vue Query holds remote history in memory. VueUse stores per-account/workspace/
channel/thread drafts and preferences in localStorage. Remote private history is
not persisted. Account-scoped drafts remain after logout; browser-profile access
can expose them. No RxDB replication or persistent message mirror is included.

The optional legacy OAuth Worker handles only configuration and a PKCE code
exchange. It remains a fallback for direct GitHub conversations, not a vault
proxy. Its secret belongs in the Worker, never in public build configuration.

Public issue triggers can consume Actions capacity even for rejected requests.
Workflow queues, GitHub rate limits, action start latency and account policies
bound this experimental design. Standard public hosted runners are free, but
availability and abuse controls remain GitHub's responsibility. No public HTTP
endpoint is provided by Actions.

## Primary sources

- [GitHub App Device Flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [App manifest registration](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest)
- [Repository collaborators and inherited access](https://docs.github.com/en/rest/collaborators/collaborators#list-repository-collaborators)
- [Actions concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- [Discussions GraphQL](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions)

## Open sandbox and installer entry

The shared demo belongs to `gitrew-sandbox`; `inchidev/gitrew` remains source code.
Its public GitHub App accepts authorization from people outside the organization.
After sign-in the client submits an encrypted `join` operation once per session.
Only `openRegistration: true` in the private member directory enables this
operation for outsiders. The public config flag only enables the client flow.
The Action uses the GitHub issue actor's immutable ID and login, audits vault
access before registering, and serializes joins with other vault mutations.
Joining gives no GitHub repository or organization membership, administrator
role, or existing conversation membership. A removed user is blocked from
self-registration until an administrator explicitly invites them again.

`/create/` is available before signing in to the sandbox. Creator authorization
uses the configured shared Creator mailbox, independently of a team's current
chat session. The setup checkpoint and optional Pages choice survive reloads in
the same browser tab. The final step uses the team's own user token to request
vault members through Actions and checks the public chat repository. A generated
configuration alone is not treated as verified. Closing the tab during a partial
registration can lose recovery material; complete it in the same tab.
