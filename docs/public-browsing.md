# Public browsing (hosted mode)

`gitrew.com/github/<owner>` and `gitrew.com/github/<owner>/<repo>` let anyone
read public repositories and Discussions without signing in or installing
anything. Posting, reactions, private content and huddles are not part of
this mode; teams that need them run their own workspace installation.

## Rules the implementation enforces

- **One page per request.** Every public endpoint issues exactly one upstream
  GitHub request for a single page (30 repos, 25 discussions, 30 comments,
  first 10 replies inline). Nothing walks pagination, and nothing is indexed.
- **Confirmed-public only.** Repositories are served only when GitHub reports
  `isPrivate: false`; missing and private pages return the same 404.
- **Short-lived cache.** Responses are cached in D1 (90s for lists, 5 minutes
  for metadata) so repeated views share one upstream request.
- **Visitor budgets.** Each client IP gets 60 requests per minute across all
  public endpoints; over-budget callers get 429.
- **No credentials in browsers.** Anonymous pages call same-origin
  `/api/public/*`. The server holds the only GitHub credential and never
  reflects it, visitor tokens or upstream bodies back to clients.
- **No other API surface.** The public worker answers `/health` and
  `/api/public/*` only; every other `/api/*` path returns 404.

## Operator setup

1. Create a token that can read public content and nothing else. A
   fine-grained token with **Public repositories** access and **no
   permissions at all** is enough: GitHub always includes read-only access
   to all public repositories, and with public-only access GitHub does not
   even offer other permissions. (A classic token with `public_repo` scope
   also works.) Set an expiration and rotate it like any credential.
2. Store it as a worker secret (never in a config file):
   `npx wrangler secret put PUBLIC_GITHUB_TOKEN --config wrangler.portal.jsonc`
3. Deploy with `wrangler.portal.jsonc`, which binds the `gitrew-public` D1
   database and sets `PUBLIC_MODE=true`. Cache and budget tables are created
   automatically on first use.
4. Verify: `https://gitrew.com/api/public/github/<owner>` returns public
   repositories; `/api/session` still returns 404.

Until the secret is set, public endpoints answer 503 and the pages show an
"unavailable" state. The landing page itself never changes.
