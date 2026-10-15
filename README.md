# Gitrew — your Git crew

A place for the people, conversations and context behind your code.
**GitHub team chat first. Cloudflare and celld.**

[Gitrew.com](https://gitrew.com) · [Create your workspace](https://gitrew.com/create/) · [Roadmap](ROADMAP.md) · [Source](https://github.com/inchidev/gitrew)

Gitrew currently provides channels, threads, private groups and DMs through GitHub, plus repository issue browsing and links to organization Project boards. A GitHub organization is the workspace. GitHub Discussions hold channel messages; a private vault stores access-controlled private conversations and access records. Each installation owns its GitHub App and credentials.

The current focus is a Slack-like chat experience: live updates, presence, typing, notifications and voice huddles. Agent handoffs, Copilot execution, Gitea and GitLab are deferred. [Documentation](docs/README.md) covers usage, installation and operations.

## Develop

Requires Node.js 24 and npm.

```sh
npm ci
npm run dev
npm run check
```

## Deploy your own

**gitrew.com is the public product site:** a landing page and `/create/` installation guide. Teams use Gitrew at their own workspace address, such as `example.com` or `gitrew.example.com`. Each deployment includes the same frontend and backend, with its own GitHub App, D1, Durable Object and conversation repositories. There is no central Gitrew account or hosted workspace provisioning.

Our workspace addresses are planned as `inchi.gitrew.com` and `afterprompt.gitrew.com`. Moving the current inchidev installation requires a coordinated GitHub App/OAuth/webhook migration. The AfterPrompt workspace additionally needs team-based authorization; current access checks admit organization members. See [deployment boundaries](docs/deployments.md).

- [Cloudflare Worker + D1](docs/cloudflare-backend.md)
- [VPS / celld Docker installation](docs/vps.md)

The frontend and backend deploy together. Set a random `SETUP_TOKEN` of at least 32 characters before setup. Keep it: it encrypts credentials and sessions. Open `/create/` **on your deployment** at the final HTTPS address, register the organization-owned GitHub App, sign in and install it on selected repositories. Provision a fresh `gitrew-chat` / `gitrew-vault` pair. Give the App access to any source repositories you want to see in Issues & Projects.

Gitrew is MIT licensed. Hosting, GitHub plans and AI usage are paid to your chosen services. There is no agent execution included in the current release.

## Architecture

Nuxt 4 + Vue + Nuxt UI frontend; a Workers-compatible backend with encrypted sessions and configuration in D1 (Cloudflare/celld) and Durable Object live coordination. Messages stay on GitHub. The public product site and organization-owned workspace installations deploy independently from the same repository.

[Architecture](docs/architecture.md) · [inchidev installation verification](docs/inchidev-install.md) · [Legacy client-only setup](docs/self-hosting.md)
