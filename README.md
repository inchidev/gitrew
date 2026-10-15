# Gitrew — your Git crew

A place for the people, conversations and context behind your code.
**GitHub first. Gitea next to explore. GitLab later.**

[Open Gitrew](https://gitrew.inchi.dev) · [Roadmap](ROADMAP.md) · [Source](https://github.com/inchidev/gitrew)

Gitrew currently provides channels, threads, private groups and DMs through GitHub, plus repository issue browsing and links to organization Project boards. A GitHub organization is the workspace. GitHub Discussions hold channel messages; a private vault stores encrypted private conversations and access records. Each installation owns its GitHub App and credentials.

The next workflow connects conversations to repository issues and Projects, then to a reviewed agent task and pull request. Copilot execution is planned. Cursor, Claude/Scion and Cloudflare Artifacts are research references, not shipped integrations. Gitea and GitLab do not connect yet.

## Develop

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
npm run check
```

## Deploy your own

- [Cloudflare Worker + D1](docs/cloudflare-backend.md)
- [Vercel + private Blob storage](docs/vercel.md)
- [Local celld Docker installation](docs/celld.md)

The frontend and backend deploy together. Set a random `SETUP_TOKEN` of at least 32 characters before setup. Keep it: it encrypts credentials and sessions. Open `/create/` at the final HTTPS address, register the organization-owned GitHub App, sign in and install it on selected repositories. Provision a fresh `gitrew-chat` / `gitrew-vault` pair. Give the App access to any source repositories you want to see in Issues & Projects.

Gitrew is MIT licensed. Hosting, GitHub plans and AI usage are paid to your chosen services. There is no agent execution included in the current release.

## Architecture

Nuxt 4 + Vue + Nuxt UI frontend; a Workers-compatible backend with encrypted sessions and configuration in D1 (Cloudflare/celld) or private Blob storage (Vercel). Messages stay on GitHub. The production site uses an organization-owned installation; it is not an open signup sandbox.

[Architecture](docs/architecture.md) · [inchidev installation verification](docs/inchidev-install.md) · [Legacy client-only setup](docs/self-hosting.md)
