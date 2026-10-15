# Host your own Gitrew

Use the frontend/API deployment on [Cloudflare](cloudflare-backend.md) or
[Vercel](vercel.md), then open `/create/` on your deployment. Both create private
chat and vault repositories owned by your GitHub organization.

Active organization members receive read access to the chat repository when they
sign in. Keep organization base permissions at **None** and give ordinary members
no access to the vault. The API enforces participant lists for private groups and
DMs; workspace administrators can read all vault conversations.

The earlier static/Actions installer is retired. It required a public
`gitrew-auth` mailbox and exposed authentication metadata. Its CLI entrypoints and
browser setup no longer provision repositories. The
[legacy architecture](legacy-architecture.md) remains historical reference for
existing installations, not a supported new deployment path.
