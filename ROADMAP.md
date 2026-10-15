# Gitrew direction

## Now: GitHub

Ship an organization workspace with channels, threads, private groups and DMs. Run the fresh inchidev workspace against its own App and private chat/vault repositories. Source repositories stay distinct from conversation storage.

## First milestone: conversation to work

1. Show issues and Projects for selected accessible repositories.
2. Turn explicitly selected messages into an issue with a preview of the shared context.
3. Link issue, repository and Project back to the conversation.
4. Prototype a Copilot task handoff with explicit consent, user authentication and visible status/PR. Verify API availability and plan requirements before implementing.
5. Bring checks, review and outcome back into the thread.

Do not send private conversations to an issue, agent or third party automatically. GitHub is the first provider because conversations, repository work and Copilot can form one useful loop.

## Then: Gitea, then GitLab

Prove Gitea OAuth, repository access, message/thread storage and private membership with a small spike before promising parity. Gitea is particularly interesting for small independently hosted installations. GitLab follows after validating hosted/self-hosted group access, issues, merge requests and pipelines. Bitbucket is outside the current scope.

## Hosting

Keep Cloudflare and Vercel installation paths. Test celld locally with the same Worker, D1 and static assets. A successful local test is not a production Coolify deployment: production also needs HTTPS, durable storage/backups, upgrades and authentication verification.

## Watch and learn

- [Cursor cloud agents](https://cursor.com/docs/cloud-agent): remote environments, API handoff, repository results.
- [Claude / Anthropic Scion](https://www.anthropic.com/engineering/redesigning-source-control): agent-scale source control; Scion is internal research.
- [Cloudflare Git platform direction](https://blog.cloudflare.com/next-git-platform-on-cloudflare/): Artifacts repository backend, Sandboxes for execution, AI Gateway for model routing. These are separate responsibilities.
- [GitOrange](https://github.com/choyiny/gitorange), [Weft](https://github.com/celador/weft), [AgentBranches](https://github.com/alexeygrigorev/cloudflare-agent-git): evaluate repository models, agent operations and interface ideas before reuse.
- [Anycord](https://github.com/inchidev/anycord), [Discoflare](https://github.com/vnmtvlv/discoflare): independent conversation products; references for communication and self-hosting, without requiring Git as their data model.

Research references are not compatibility promises or endorsements of production readiness.
