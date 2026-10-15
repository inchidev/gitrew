# Fresh inchidev installation — 2026-10-15

Site: https://gitrew.inchi.dev · source: https://github.com/inchidev/gitrew

The maintained site is an independent, closed inchidev workspace. It uses the private organization-owned `gitrew-inchidev` App, a new Cloudflare Worker and new D1 database. The production build uses `npm run build:worker` and `npx wrangler deploy --config wrangler.inchidev.jsonc`. That configuration belongs to this installation; independent copies should use the root `wrangler.jsonc` and their own resources.

## Verified live

- GitHub App registration, owner OAuth sign-in, selected-repository installation and workspace provisioning completed through Chrome.
- Working repositories: `inchidev/gitrew` and `inchidev/anycord`. No all-repository installation grant was used.
- New `inchidev/gitrew-chat` and `inchidev/gitrew-vault` are private. Discussions are enabled on chat. Organization base repository access remains None; the vault collaborator audit lists only its administrator.
- The general channel opens through the production domain. The owner session survives a production redeployment.
- Gitrew lists repository issues/PRs and opens both private organization boards: [Gitrew crew](https://github.com/orgs/inchidev/projects/1) and [Anycord crew](https://github.com/orgs/inchidev/projects/2). The boards import the existing open issues from their respective repositories.
- Production health and public config return200. The custom hostname is backed by a Worker-managed DNS record. The inchi.dev catalogue and metadata use Gitrew.
- The installation setup key is saved in the ignored local `.gitrew-setup/cloudflare.env` file, mode0600, within a mode0700 directory. No secret is committed.

## Fresh-start cleanup

Removed the old source repository `inchidev/ghrew`, five Ghrew sandbox experiment repositories and the Vercel source copy `vnmtvlv/ghrew-vercel-test-20261015`. Removed both obsolete Ghrew GitHub App registrations and installations.

Removed Cloudflare `ghrew-api`, its `ghrew-sandbox` D1 database, old route, DNS record and connected build trigger. There were no Cloudflare Pages projects. Removed the old Vercel test project and both named Ghrew Blob stores. The retired Vercel domain returns404; the old Ghrew hostname no longer resolves.

The active checkout is now `Documents/gitrew` with a fresh Git history. The retired checkout was removed from Documents through the local Trash. No old application data was imported into the new workspace.

## Local and remaining coverage

See [celld local verification](celld.md). celld0.6.2 served installation/client routes, initialized D1, rejected an incorrect setup key and retained its key after restart. This does not establish a production Coolify fleet or local GitHub OAuth flow.

Unit/type/build checks, existing browser suites and Vercel packaging passed. Responsive renders and the final platform matrix passed their mechanical checks. No second-human-account private-message verification was performed, and no Copilot execution or Gitea/GitLab integration is claimed.
