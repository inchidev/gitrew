import { type Page } from "@playwright/test";

/** Real application rendering with synthetic API responses, never production data. */
export async function sampleWorkspace(page: Page, administrator = false) {
  let signedIn = true;
  const workspace = {
    version: 1,
    backend: true,
    repository: "inchidev/gitrew-afterprompt-chat",
    vault: "inchidev/gitrew-afterprompt-vault",
    clientId: "sample-client",
    appSlug: "sample-app",
    publicKey: "",
    openRegistration: false,
    memberPrivateChannels: false,
    displayName: "AfterPrompt",
    administrator,
  };
  const app = {
    appSlug: "sample-app",
    owner: "inchidev",
    installUrl: "https://github.com/apps/sample-app/installations/new",
  };
  const pageInfo = { hasNextPage: false, endCursor: null };
  const samples = [
    ["robin", "Morning, crew. The new docs are ready for a look."],
    ["sam", "Reading them now. The installation steps are much clearer."],
    ["robin", "Thanks! I added the backup steps too."],
    ["sam", "Let’s try a fresh install together before we share it."],
    ["robin", "Sounds good. I’ll post the results here."],
  ];
  const messages = samples.map(([login, body], i) => ({
    id: `sample-${i}`,
    body,
    createdAt: `2026-10-16T09:${10 + i * 3}:00Z`,
    updatedAt: `2026-10-16T09:${10 + i * 3}:00Z`,
    url: `https://github.com/inchidev/gitrew/discussions/1#sample-${i}`,
    author: { login },
    replies: {
      nodes: i
        ? []
        : [
            {
              id: "sample-reply",
              body: "I can check the Cloudflare steps this afternoon.",
              createdAt: "2026-10-16T09:12:00Z",
              updatedAt: "2026-10-16T09:12:00Z",
              author: { login: "sam" },
              url: "https://github.com/inchidev/gitrew/discussions/1#sample-reply",
            },
          ],
      pageInfo,
    },
  }));
  await page.route("https://github.com/*.png?*", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config")
      return route.fulfill({
        json: {
          configured: true,
          setupAvailable: true,
          workspaceReady: true,
          displayName: workspace.displayName,
          app,
          sandbox: "",
          realtime: false,
          push: false,
          huddles: null,
        },
      });
    if (path === "/api/session")
      return route.fulfill(
        signedIn
          ? {
              json: {
                viewer: { id: 1, login: "robin" },
                csrf: "s".repeat(64),
                expiresAt: Date.now() + 3600000,
                workspace,
                app,
                sandbox: "",
              },
            }
          : { status: 401, json: { error: "Signed out" } },
      );
    if (path === "/api/logout") {
      signedIn = false;
      return route.fulfill({ json: { signedOut: true } });
    }
    if (path === "/api/workspace/settings") {
      if (!administrator)
        return route.fulfill({
          status: 403,
          json: { error: "Only administrators can change settings." },
        });
      workspace.displayName = route.request().postDataJSON().displayName;
      return route.fulfill({ json: { workspace } });
    }
    if (path === "/api/vault") {
      const operation = route.request().postDataJSON().operation;
      if (operation.op === "list")
        return route.fulfill({ json: { channels: [] } });
      if (operation.op === "members")
        return route.fulfill({
          json: {
            members: [
              { id: 1, login: "robin" },
              { id: 2, login: "sam" },
            ],
            admins: [administrator ? 1 : 9],
          },
        });
    }
    if (path === "/api/github") {
      const input = route.request().postDataJSON();
      if (input.path.startsWith("/user/installations"))
        return route.fulfill({
          json: { total_count: 1, installations: [{ id: 9 }] },
        });
      if (input.path.includes("/repositories"))
        return route.fulfill({
          json: {
            total_count: 1,
            repositories: [
              {
                id: 1,
                full_name: workspace.repository,
                private: true,
                has_discussions: true,
              },
            ],
          },
        });
      if (input.path === "/graphql") {
        const query = input.body.query;
        if (query.includes("query Channels"))
          return route.fulfill({
            json: {
              data: {
                repository: {
                  discussions: {
                    nodes: [
                      {
                        id: "general",
                        title: "#general",
                        body: "The team’s conversation",
                        url: "https://github.com/inchidev/gitrew/discussions/1",
                      },
                    ],
                    pageInfo,
                  },
                },
              },
            },
          });
        if (query.includes("query Messages"))
          return route.fulfill({
            json: {
              data: { node: { comments: { nodes: messages, pageInfo } } },
            },
          });
      }
    }
    throw new Error(
      "Unexpected sample API request " +
        path +
        (path === "/api/github"
          ? " " + route.request().postDataJSON().path
          : ""),
    );
  });
  return workspace;
}
