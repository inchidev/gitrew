export const cloudflareDeployUrl =
  "https://deploy.workers.cloudflare.com/?url=https://github.com/inchidev/gitrew";
export const vercelDeployUrl =
  "https://vercel.com/new/clone?" +
  new URLSearchParams({
    "repository-url": "https://github.com/inchidev/gitrew",
    "project-name": "gitrew",
    "repository-name": "gitrew",
    env: "SETUP_TOKEN",
    envDescription:
      "Choose a random setup key of at least 32 characters. Keep it: it protects your GitHub App credentials and sessions. Enter it on /create/ after deployment.",
    envLink: "https://github.com/inchidev/gitrew/blob/main/docs/vercel.md",
    stores: JSON.stringify([{ type: "blob", access: "private" }]),
  }).toString();
