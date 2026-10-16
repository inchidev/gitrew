// Maintainer bootstrap for the shared installer App. Browser approval is required.
// Pass the organization that owns the gitrew-auth mailbox repository.
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
const organization = process.argv[2] || "",
  repository = organization ? `${organization}/gitrew-auth` : "";
if (!/^[\w-]+$/.test(organization))
  throw new Error(
    "Pass the creator organization: node scripts/register-creator.mjs your-org.",
  );
  state = crypto.randomUUID();
let base = "";
const gh = (args) =>
  execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
const server = createServer(async (req, res) => {
  const url = new URL(req.url, base);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (url.pathname === "/callback") {
    if (
      url.searchParams.get("state") !== state ||
      !url.searchParams.get("code")
    ) {
      res.statusCode = 400;
      res.end("Invalid registration callback.");
      return;
    }
    try {
      const response = await fetch(
        `https://api.github.com/app-manifests/${encodeURIComponent(url.searchParams.get("code"))}/conversions`,
        { method: "POST", headers: { Accept: "application/vnd.github+json" } },
      );
      if (!response.ok) throw new Error("Registration failed");
      const app = await response.json();
      if (
        app.owner?.login !== organization ||
        typeof app.client_id !== "string" ||
        typeof app.slug !== "string"
      )
        throw new Error("Unexpected App owner");
      const file = JSON.parse(
        gh(["api", `repos/${repository}/contents/gitrew-auth.json`]),
      );
      const config = JSON.parse(Buffer.from(file.content, "base64").toString());
      config.creatorClientId = app.client_id;
      config.creatorAppSlug = app.slug;
      execFileSync(
        "gh",
        [
          "api",
          "-X",
          "PUT",
          `repos/${repository}/contents/gitrew-auth.json`,
          "--input",
          "-",
        ],
        {
          input: JSON.stringify({
            message: "Configure shared Gitrew Creator",
            sha: file.sha,
            content: Buffer.from(JSON.stringify(config, null, 2)).toString(
              "base64",
            ),
          }),
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      // The manifest's generated private key and client secret are not needed by Device Flow and are never saved.
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<h1>Gitrew Creator registered</h1><p>Enable Device Flow in <a href="https://github.com/organizations/${organization}/settings/apps/${app.slug}">App settings</a>, then install it in the organization where you are creating a workspace.</p>`,
      );
      console.log(
        `Creator registered: ${app.slug}. Enable Device Flow before use.`,
      );
      setTimeout(() => server.close(), 10_000);
    } catch {
      res.statusCode = 500;
      res.end("Registration failed. No credentials were logged.");
    }
    return;
  }
  if (url.pathname !== "/") {
    res.statusCode = 404;
    res.end();
    return;
  }
  const manifest = {
    name: "Gitrew Creator",
    description:
      "One-time Gitrew workspace installer. Revoke access after your own workspace App is configured.",
    url: "https://gitrew.com/",
    redirect_url: base + "/callback",
    hook_attributes: {
      url: "https://gitrew.com/unused-webhook",
      active: false,
    },
    public: true,
    default_permissions: {
      administration: "write",
      contents: "write",
      workflows: "write",
      secrets: "write",
      actions: "write",
      pages: "write",
      discussions: "write",
      members: "read",
      organization_administration: "read",
    },
    default_events: [],
  };
  const encoded = JSON.stringify(manifest)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
  res.setHeader("Content-Type", "text/html");
  res.end(
    `<h1>Register Gitrew Creator</h1><p>Creates repositories and configures workflow files, encrypted secrets, public configuration and Pages using the installing administrator's authority. It stores no installer private key. Its access can be revoked after setup.</p><form action="https://github.com/organizations/${organization}/settings/apps/new?state=${state}" method="post"><input type="hidden" name="manifest" value="${encoded}"><button>Review App permissions on GitHub</button></form>`,
  );
});
server.listen(5193, "127.0.0.1", () => {
  base = "http://127.0.0.1:5193";
  console.log(`Review creator registration at ${base}`);
});
setTimeout(() => server.close(), 30 * 60_000).unref();
