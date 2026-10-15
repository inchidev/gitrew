# Gitrew on Vercel

Deploy your own frontend and Node.js function in your Vercel account, then create
a GitHub App owned by your organization through `/create/`. App keys go directly
to your function. There is no Gitrew-operated authentication service or external
database provider.

## Deploy and set up

1. Use **Deploy to Vercel** in the README or Gitrew's hosting options. Vercel copies
   the source into your Git account and builds the frontend and API together.
2. Choose a random `SETUP_TOKEN` of at least 32 characters when prompted. Keep a
   protected backup: it encrypts saved App credentials and sessions. Changing or
   losing it makes the existing configuration unreadable.
3. Create the **private Vercel Blob** store requested by the deploy flow. It holds
   encrypted configuration, setup state, sessions and workspace checkpoints.
4. Open the production site's `/create/`. Enter your organization and setup key,
   then review and create the preconfigured GitHub App on GitHub.
5. Sign in as an organization owner, install your App in that organization and
   choose the private chat and vault repository names, and create the
   workspace. GitHub still requires creation, authorization and installation
   approvals. For a second deployment in the same organization, use unused names
   such as `gitrew-vercel-chat` and `gitrew-vercel-vault`.
6. Have teammates accept their GitHub organization invitations. Open
   **Workspace members** in the sidebar and add their GitHub usernames, then
   create a private channel or DM selecting the participants. Share your site's
   `/w/YOUR_ORGANIZATION` link and verify the flow from a second account.
   Adding someone to Gitrew sends no GitHub invitation and grants no vault access.

The wizard creates the selected private chat and vault repositories
(defaults: `gitrew-chat` and `gitrew-vault`), including the
first channel and administrator directory. Organization base repository access
must be **None**; setup checks this without changing unrelated repositories.
Active organization members receive read access to the private chat repository on
sign-in. Ordinary participants must not receive repository access to the vault.

For an existing organization, select **Only select repositories** during App
installation. If GitHub requires at least one existing repository, create an
empty private bootstrap repository and select only that repository. GitHub
[automatically grants access to repositories the App creates](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app).
After setup, remove the bootstrap repository from the installation and retain
only the chosen chat and vault repositories. Leave unrelated private repositories
unselected. An installation with **All repositories** can access existing private
repositories as well.

## Configuration

| Variable                | Purpose                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| `SETUP_TOKEN`           | Required encryption/setup secret, at least 32 characters                    |
| `BLOB_STORE_ID`         | Added by the native integration for project-scoped Blob OIDC authentication |
| `BLOB_READ_WRITE_TOKEN` | Alternative server-only authentication for a manually connected store       |
| `GITREW_ORIGIN`         | Optional fixed HTTPS origin, such as `https://crew.example.com`             |

The function uses `VERCEL_PROJECT_PRODUCTION_URL` when `GITREW_ORIGIN` is unset.
Use the production address, not a deployment-specific preview URL. Configure a
custom domain **before** registering the App; set `GITREW_ORIGIN` to pin an address
explicitly. Requests on other hosts are rejected. Changing the address later
requires updating both the App and stored origin; automatic domain migration is
not implemented.

For an existing Vercel project, connect a **private** Blob store in Storage and
add `SETUP_TOKEN` in Settings → Environment Variables, then redeploy. Use a
separate project/store for testing, without production credentials. Webhooks must
reach the production function without a Vercel login wall; configure Deployment
Protection accordingly if it covers production.

## Data and trust

Conversations stay in GitHub Discussions. Private Blob contains one AES-GCM
encrypted metadata snapshot; GitHub tokens and App keys never reach frontend
JavaScript. Reads bypass the Blob CDN cache and request identity encoding so compression
cannot weaken the origin ETag. ETag conditional writes prevent
lost updates across function instances. OAuth state is single-use; expired
state, sessions, rate counters and operation locks are pruned during writes.
Secure, HttpOnly, SameSite=Lax session cookies and signed GitHub authorization
revocation webhooks use the same backend behavior as the Cloudflare deployment.

This storage is intended for independent small-team deployments. The encrypted
snapshot is capped at 2 MiB; concurrent writes can return retryable conflicts.
Metadata operations incur Blob reads/writes under the organization's Vercel
plan. Each private vault operation currently acquires and releases a distributed
lock, so even a private read or channel-list poll requires at least two metadata
writes. Private channel lists poll every two minutes while the page is visible;
message reads can add more operations. A small snapshot does not imply low write
usage: check the store's operation counters and your plan's quotas. There is no
conversation mirror in Blob. Provider quotas and billing apply.

The deployment's administrators, Vercel and GitHub are trusted operators. This
is not end-to-end encryption against them. You control the source copy and when
to deploy updates.

## Build and validation

```sh
npm ci
npm run check
npm run build:vercel
node scripts/check-vercel-build.mjs
```

`vercel.json` selects a custom build emitting Build Output API v3 artifacts in
`.vercel/output`: the static frontend, a Node.js function for `/api/*` and
`/health`, and an SPA fallback for workspace/channel deep links. Secrets are read
at runtime and must not be injected into the static frontend.

Automated checks cover encrypted persistence, concurrent state consumption,
locks, session revocation, App registration/OAuth with mocked GitHub responses,
the Node HTTP adapter and the generated deployment package. These do not prove a
fresh Vercel deployment, real Blob service behavior or GitHub approvals. Those
live checks remain required before claiming this deployment flow is verified.
