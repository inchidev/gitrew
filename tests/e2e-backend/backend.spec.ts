import { expect, test } from "@playwright/test";

const app = {
  appSlug: "gitrew-test",
  owner: "team",
  installUrl: "https://github.com/apps/gitrew-test/installations/new",
};
const workspace = {
  version: 1,
  backend: true,
  repository: "team/gitrew-chat",
  vault: "team/gitrew-vault",
  clientId: "client-id",
  appSlug: "gitrew-test",
  publicKey: "",
  openRegistration: false,
  memberPrivateChannels: false,
};

test("a fresh deployment guides App registration without an issue mailbox or manual GitHub credentials", async ({
  page,
}) => {
  let submitted: unknown;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config")
      return route.fulfill({
        json: {
          configured: false,
          setupAvailable: true,
          app: null,
          sandbox: "",
        },
      });
    if (path === "/api/setup/start") {
      submitted = route.request().postDataJSON();
      return route.fulfill({
        json: {
          action:
            "https://github.com/organizations/team/settings/apps/new?state=" +
            "a".repeat(64),
          manifest: JSON.stringify({ name: "Gitrew team", public: false }),
        },
      });
    }
    throw new Error("Unexpected API request " + path);
  });
  await page.goto("/login");
  await expect(page).toHaveURL(/\/create\/$/);
  await expect(
    page.getByRole("heading", { name: "1. Register your GitHub App" }),
  ).toBeVisible();
  await page.getByLabel("GitHub organization", { exact: true }).fill("team");
  await page
    .getByLabel("Deployment setup key", { exact: true })
    .fill("test-only-key-with-at-least-32-characters");
  await page.getByRole("button", { name: "Prepare GitHub App" }).click();
  await expect(
    page.getByRole("button", { name: "Review and create App on GitHub" }),
  ).toBeVisible();
  expect(submitted).toEqual({
    organization: "team",
    setupToken: "test-only-key-with-at-least-32-characters",
  });
  await expect(page.locator('input[name="manifest"]')).toHaveValue(
    /"public":false/,
  );
  expect(await page.locator("body").innerText()).not.toContain(
    "Enable Device Flow",
  );
});

test("an owner installs the deployment's App and creates a verified workspace", async ({
  page,
}) => {
  const calls: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config")
      return route.fulfill({
        json: { configured: true, setupAvailable: true, app, sandbox: "" },
      });
    if (path === "/api/session")
      return route.fulfill({
        json: {
          viewer: { id: 1, login: "alice" },
          csrf: "c".repeat(64),
          expiresAt: Date.now() + 86400_000,
          workspace: null,
          app,
          sandbox: "",
        },
      });
    if (path === "/api/workspaces") {
      calls.push(route.request().postDataJSON());
      expect(route.request().headers()["x-gitrew-csrf"]).toBe("c".repeat(64));
      return route.fulfill({ json: { workspace } });
    }
    throw new Error("Unexpected API request " + path);
  });
  await page.goto("/create/");
  await expect(
    page.getByRole("heading", { name: "3. Connect your organization" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Install GitHub App" }),
  ).toHaveAttribute("href", app.installUrl);
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByText("Workspace prepared", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open your workspace" }),
  ).toHaveAttribute("href", "/w/team");
  expect(calls).toEqual([
    {
      organization: "team",
      repositoryName: "gitrew-chat",
      vaultName: "gitrew-vault",
    },
  ]);
});

for (const repositoryName of ["gitrew-chat", "gitrew-test-chat"]) {
  test(`cookie sessions use ${repositoryName} despite a stale preference, preserve private reads and clear on sign-out`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "gitrew:workspaces:v2",
        JSON.stringify({ alice: "old-team/gitrew-chat" }),
      );
    });
    const connectedWorkspace = {
      ...workspace,
      repository: `team/${repositoryName}`,
      vault: "team/gitrew-test-vault",
    };
    const channelRepositories: string[] = [];
    const suffix =
      repositoryName === "gitrew-chat" ? "" : `?repo=${repositoryName}`;
    const expectChannel = (kind: string, id: string) =>
      expect(page).toHaveURL(
        `http://127.0.0.1:5182/w/team/${kind}/${id}${suffix}`,
      );
    let signedOut = false;
    let huddleReleased = false;
    let vaultListAttempts = 0;
    const sdkErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") sdkErrors.push(message.text());
    });
    const requests: { url: string; authorization: string | undefined }[] = [];
    page.on("request", (request) =>
      requests.push({
        url: request.url(),
        authorization: request.headers().authorization,
      }),
    );
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/config")
        return route.fulfill({
          json: { configured: true, setupAvailable: true, app, sandbox: "" },
        });
      if (path === "/api/session")
        return route.fulfill({
          status: signedOut ? 401 : 200,
          json: signedOut
            ? { error: "Signed out" }
            : {
                viewer: { id: 1, login: "alice" },
                csrf: "c".repeat(64),
                expiresAt: Date.now() + 86400_000,
                workspace: connectedWorkspace,
                app,
                sandbox: "",
              },
        });
      if (path === "/api/logout") {
        signedOut = true;
        return route.fulfill({ json: { signedOut: true } });
      }
      if (path === "/api/huddle/join")
        return route.fulfill({
          json: {
            provider: "realtimekit",
            token: "invalid-participant-token",
            url: "",
            lease: "test-huddle-lease",
          },
        });
      if (path === "/api/huddle/leave") {
        expect(route.request().postDataJSON().lease).toBe("test-huddle-lease");
        huddleReleased = true;
        return route.fulfill({ json: { left: true } });
      }
      if (path === "/api/vault") {
        const body = route.request().postDataJSON();
        if (body.operation.op === "list" && vaultListAttempts++ === 0)
          return route.fulfill({
            status: 409,
            json: {
              error:
                "Another workspace operation is in progress. Retry shortly.",
            },
          });
        if (body.operation.op === "list")
          return route.fulfill({
            json: {
              channels: [
                {
                  id: "direct-channel",
                  name: "Bob",
                  kind: "dm",
                  description: "",
                },
                {
                  id: "private-channel",
                  name: "Private room",
                  description: "Members only",
                  kind: "private",
                },
              ],
            },
          });
        if (body.operation.op === "read")
          return route.fulfill({
            json: {
              messages: [
                {
                  id: "m1",
                  channelId: body.operation.conversation,
                  parentId: "",
                  author: "bob",
                  body: "Only permitted participants can see this.",
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  status: "saved",
                  url: "",
                },
              ],
            },
          });
        throw new Error("Unexpected private operation");
      }
      if (path === "/api/github") {
        const body = route.request().postDataJSON();
        if (body.path.startsWith("/user/installations/9/repositories"))
          return route.fulfill({
            json: {
              total_count: 1,
              repositories: [
                {
                  id: 10,
                  full_name: `team/${repositoryName}`,
                  private: false,
                  has_discussions: true,
                },
              ],
            },
          });
        if (body.path.startsWith("/user/installations"))
          return route.fulfill({
            json: { total_count: 1, installations: [{ id: 9 }] },
          });
        if (
          body.path === "/graphql" &&
          body.body.query.includes("query Channels")
        ) {
          channelRepositories.push(body.body.variables.name);
          return route.fulfill({
            json: {
              data: {
                repository: {
                  discussions: {
                    nodes: [
                      {
                        id: "general",
                        title: "general",
                        body: "Welcome",
                        url: `https://github.com/team/${repositoryName}/discussions/1`,
                      },
                    ],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              },
            },
          });
        }
        if (body.path === "/graphql")
          return route.fulfill({
            json: {
              data: {
                node: {
                  comments: {
                    nodes: [],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              },
            },
          });
        throw new Error("Unexpected GitHub proxy operation");
      }
      throw new Error("Unexpected API request " + path);
    });
    await page.goto("/?workspace=old-team/gitrew-chat&channel=private-channel");
    await expect(page.locator(".workspace-title")).toHaveText("team");
    await expect(
      page.getByText("Conversations are busy. Try again shortly."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/w\/old-team\/c\/private-channel$/);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Private room", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Only permitted participants can see this."),
    ).toBeVisible();
    await expectChannel("c", "private-channel");
    await page.getByRole("button", { name: "# general", exact: true }).click();
    await expectChannel("c", "general");
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "Private room", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Bob", exact: true }).click();
    await expectChannel("dm", "direct-channel");
    await page.goBack();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Private room", exact: true }),
    ).toBeVisible();
    await page.goto("/?channel=missing-channel");
    await expect(
      page.getByRole("heading", { name: "# general", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Private room/ }).click();
    await expect(
      page.getByText("Only permitted participants can see this."),
    ).toBeVisible();
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "# general", exact: true }),
    ).toBeVisible();
    await expectChannel("c", "general");
    await page.getByRole("button", { name: /Private room/ }).click();
    await expect(
      page.getByText("Only permitted participants can see this."),
    ).toBeVisible();
    expect(channelRepositories.length).toBeGreaterThan(0);
    expect(channelRepositories.every((name) => name === repositoryName)).toBe(
      true,
    );
    expect(
      requests.some((r) => r.url.startsWith("https://api.github.com")),
    ).toBe(false);
    expect(requests.some((r) => r.authorization)).toBe(false);
    expect(
      await page.evaluate(() => JSON.stringify({ ...sessionStorage })),
    ).not.toContain("gitrew-backend:");
    // Load the real browser SDK with the scoped UUID override. Its invalid-token
    // error occurs after UUID generation, before provider or microphone access.
    await page
      .getByRole("button", { name: "Join huddle", exact: true })
      .click();
    const huddle = page.getByRole("dialog", { name: "Voice huddle" });
    await expect(
      huddle.getByText(/Could not initialize the huddle/),
    ).toBeVisible();
    expect(
      sdkErrors.some((message) =>
        message.includes("Invalid auth token provided"),
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() =>
        Boolean(customElements.get("rtk-participants-audio")),
      ),
    ).toBe(true);
    await huddle
      .getByRole("button", { name: "Disconnect", exact: true })
      .click();
    await expect(huddle).toHaveCount(0);
    await expect.poll(() => huddleReleased).toBe(true);
    await page
      .getByRole("button", { name: "User settings", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Continue with GitHub" }),
    ).toBeVisible();
    await expect(
      page.getByText("Only permitted participants can see this."),
    ).toHaveCount(0);
    expect(signedOut).toBe(true);
  });
}

test("signed-out entry has no hidden chat shell at phone, tablet and desktop widths", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config")
      return route.fulfill({
        json: { configured: true, setupAvailable: true, app, sandbox: "team" },
      });
    if (path === "/api/session")
      return route.fulfill({ status: 401, json: { error: "Signed out" } });
    throw new Error(
      "Signed-out entry attempted a conversation request: " + path,
    );
  });
  for (const width of [390, 712, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: "Continue with GitHub" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("heading", { name: "Sign in to Gitrew", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".gitrew-shell")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("textbox", { name: "Message", exact: true }),
    ).toHaveCount(0);
    const copy = await page.locator("main").innerText();
    expect(copy).not.toMatch(
      /vault|Cloudflare|backend|Actions|repository|token/i,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
  await expect(page.getByRole("button", { name: "Try a demo" })).toHaveCount(0);
});

test("workspace roots show sign-in directly, and protected links preserve their destination", async ({
  page,
}) => {
  const apiRequests: string[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    apiRequests.push(path);
    if (path === "/api/config")
      return route.fulfill({
        json: { configured: true, setupAvailable: true, app, sandbox: "team" },
      });
    if (path === "/api/session")
      return route.fulfill({ status: 401, json: { error: "Signed out" } });
    if (path === "/api/auth/start")
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "GitHub sign-in started",
      });
    throw new Error("Unexpected API request " + path);
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Sign in to Gitrew", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".gitrew-landing")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Create your own workspace" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeEnabled();
  expect(apiRequests).toContain("/api/config");
  for (const path of ["/demo", "/demo/c/preview-general"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toContainText("404");
    await expect(page.locator(".gitrew-shell")).toHaveCount(0);
  }
  await page.goto("/?preview=1");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page.locator(".gitrew-shell")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Continue with GitHub" }),
  ).toBeEnabled();
  await page.goto("/w/team/c/private-channel?thread=m1");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(
    "/w/team/c/private-channel?thread=m1",
  );
  await expect(page.locator(".gitrew-shell")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue with GitHub" }).click();
  await expect(page).toHaveURL(/\/api\/auth\/start\?returnTo=/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(
    "/w/team/c/private-channel?thread=m1",
  );
});

test("workspace members can be managed directly from the sidebar without creating a conversation", async ({
  page,
}) => {
  const members = [{ id: 1, login: "alice" }];
  let viewerId = 1;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config")
      return route.fulfill({
        json: { configured: true, setupAvailable: true, app, sandbox: "" },
      });
    if (path === "/api/session")
      return route.fulfill({
        json: {
          viewer: { id: viewerId, login: viewerId === 1 ? "alice" : "bob" },
          csrf: "c".repeat(64),
          expiresAt: Date.now() + 86400_000,
          workspace,
          app,
          sandbox: "",
        },
      });
    if (path === "/api/vault") {
      const { operation } = route.request().postDataJSON();
      if (operation.op === "list")
        return route.fulfill({ json: { channels: [] } });
      if (operation.op === "members")
        return route.fulfill({ json: { members, admins: [1] } });
      if (operation.op === "invite") {
        expect(viewerId).toBe(1);
        expect(operation.login).toBe("bob");
        members.push({ id: 2, login: "bob" });
        return route.fulfill({ json: { member: members[1] } });
      }
      if (operation.op === "remove") {
        expect(operation.userId).toBe(2);
        members.splice(1, 1);
        return route.fulfill({ json: { removed: 2 } });
      }
      throw new Error("Unexpected member operation " + operation.op);
    }
    if (path === "/api/github") {
      const body = route.request().postDataJSON();
      if (body.path.startsWith("/user/installations"))
        return route.fulfill({ json: { total_count: 0, installations: [] } });
      if (body.path === "/graphql")
        return route.fulfill({
          json: {
            data: {
              repository: {
                discussions: {
                  nodes: [],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            },
          },
        });
    }
    throw new Error("Unexpected API request " + path);
  });
  await page.goto("/w/team");
  await page
    .getByRole("button", { name: "Workspace members", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Workspace members", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText(/after they accept your GitHub organization invitation/),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Create conversation" }),
  ).toHaveCount(0);
  await dialog
    .getByLabel("Add by GitHub username", { exact: true })
    .fill("bob");
  await dialog
    .getByRole("button", { name: "Add workspace member", exact: true })
    .click();
  await expect(dialog.getByText("Member added", { exact: true })).toBeVisible();
  await expect(dialog.getByText("bob", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: "Remove from workspace", exact: true })
    .click();
  await expect(dialog.getByText("bob", { exact: true })).toHaveCount(0);
  members.push({ id: 2, login: "bob" });
  viewerId = 2;
  await page.reload();
  await page
    .getByRole("button", { name: "Workspace members", exact: true })
    .click();
  await expect(
    dialog.getByText("Workspace administrators manage membership."),
  ).toBeVisible();
  await expect(
    dialog.getByRole("list", { name: "Workspace member list" }),
  ).toContainText("bob");
  await expect(
    dialog.getByRole("button", { name: "Add workspace member" }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Remove from workspace" }),
  ).toHaveCount(0);
});

test("setup preserves custom repository names across reloads and opens the selected chat", async ({
  page,
}) => {
  let submitted: unknown;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config")
      return route.fulfill({
        json: { configured: true, setupAvailable: true, app, sandbox: "" },
      });
    if (path === "/api/session")
      return route.fulfill({
        json: {
          viewer: { id: 1, login: "alice" },
          csrf: "c".repeat(64),
          expiresAt: Date.now() + 86400_000,
          workspace: null,
          app,
          sandbox: "",
        },
      });
    if (path === "/api/workspaces") {
      submitted = route.request().postDataJSON();
      return route.fulfill({
        json: {
          workspace: {
            ...workspace,
            repository: "team/gitrew-test-chat",
            vault: "team/gitrew-test-vault",
          },
        },
      });
    }
    throw new Error("Unexpected API request " + path);
  });
  await page.goto("/create/");
  for (const [chat, vault] of [
    ["afterprompt-chat", "gitrew-afterprompt-vault"],
    ["gitrew-afterprompt-chat", "afterprompt-vault"],
  ]) {
    await page.getByLabel("Chat repository", { exact: true }).fill(chat);
    await page
      .getByLabel("Private vault repository", { exact: true })
      .fill(vault);
    await page
      .getByRole("button", { name: "Create workspace", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Start repository names with gitrew-",
    );
    expect(submitted).toBeUndefined();
  }
  await page
    .getByLabel("Chat repository", { exact: true })
    .fill("gitrew-test-chat");
  await page
    .getByLabel("Private vault repository", { exact: true })
    .fill("gitrew-test-vault");
  await page.reload();
  await expect(page.getByLabel("Chat repository", { exact: true })).toHaveValue(
    "gitrew-test-chat",
  );
  await expect(
    page.getByLabel("Private vault repository", { exact: true }),
  ).toHaveValue("gitrew-test-vault");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByText("Workspace prepared", { exact: true }),
  ).toBeVisible();
  expect(submitted).toEqual({
    organization: "team",
    repositoryName: "gitrew-test-chat",
    vaultName: "gitrew-test-vault",
  });
  await expect(
    page.getByRole("link", { name: "Open your workspace" }),
  ).toHaveAttribute("href", "/w/team?repo=gitrew-test-chat");
});
