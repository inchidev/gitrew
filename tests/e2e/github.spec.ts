import { expect, test } from "@playwright/test";
import { githubRoutes, session } from "./fixtures/github";

test("GitHub OAuth completes with PKCE, sends directly to Discussions, and clears the session on sign-out", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  await githubRoutes(page);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.route("http://127.0.0.1:5180/config", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        clientId: "test-client",
        redirectUri: origin + "/",
        installUrl: "https://github.com/apps/test-gitrew/installations/new",
      }),
    }),
  );
  await page.route("https://github.com/login/oauth/authorize**", (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.has("client_secret")).toBe(false);
    return route.fulfill({
      status: 302,
      headers: {
        location: `${origin}/?code=test-code&state=${url.searchParams.get("state")}`,
      },
    });
  });
  let exchanges = 0;
  await page.route("http://127.0.0.1:5180/exchange", (route) => {
    exchanges++;
    const body = route.request().postDataJSON();
    expect(body.code).toBe("test-code");
    expect(body.verifier).toHaveLength(64);
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        accessToken: "test-browser-session",
        expiresAt: Date.now() + 28_800_000,
      }),
    });
  });
  await page.goto("/login?workspace=inchidev/gitrew");
  await page.getByRole("button", { name: "Continue with GitHub" }).click();
  await expect(
    page.getByText("A conversation from GitHub", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(exchanges).toBe(1);
  expect(page.url()).not.toContain("code=");
  expect(page.url()).not.toContain("state=");
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill("Sent under my GitHub identity");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page
      .locator(".message")
      .filter({ hasText: "Sent under my GitHub identity" }),
  ).toContainText("Sent");
  await expect(composer).toHaveValue("");
  expect(
    requests
      .filter((url) => url.startsWith("http://127.0.0.1:5180/"))
      .map((url) => new URL(url).pathname),
  ).toEqual(["/config", "/config", "/exchange"]);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "test-browser-session",
  );
  await page
    .getByRole("button", { name: "User settings", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to Gitrew", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".gitrew-shell")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("gitrew:github-session:v1"),
    ),
  ).toBeNull();
  await expect(
    page.getByText("Sent under my GitHub identity", { exact: true }),
  ).toHaveCount(0);
});

test("failed sends preserve the draft, and refresh replaces edited and deleted messages", async ({
  page,
}) => {
  await session(page);
  const messages = await githubRoutes(page, true);
  await page.goto("/login?workspace=inchidev/gitrew");
  await expect(
    page.getByText("A conversation from GitHub", { exact: true }),
  ).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill("Keep my draft after a rejected send");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Your draft is still here",
  );
  await expect(composer).toHaveValue("Keep my draft after a rejected send");
  messages[0]!.body = "Edited on GitHub";
  messages.splice(1);
  await page.getByRole("button", { name: "Refresh messages" }).click();
  await expect(
    page.getByText("Edited on GitHub", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("This message will be deleted", { exact: true }),
  ).toHaveCount(0);
});

test("switching repositories isolates messages and keeps drafts in their original workspace", async ({
  page,
}) => {
  await session(page);
  await githubRoutes(page);
  await page.goto("/login?workspace=inchidev/gitrew");
  await expect(
    page.getByText("A conversation from GitHub", { exact: true }),
  ).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await composer.fill("Draft for the public workspace");
  await page.goto("/w/my-team?repo=private-chat");
  await expect(
    page.getByText("Only the private workspace", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("A conversation from GitHub", { exact: true }),
  ).toHaveCount(0);
  await expect(composer).toHaveValue("");
  await composer.fill("Draft for the private workspace");
  await page.goto("/w/inchidev?repo=gitrew");
  await expect(composer).toHaveValue("Draft for the public workspace");
});

test("prefixed storage stays out of project repositories and vaults stay out of workspaces and channel reads", async ({
  page,
}) => {
  await session(page);
  await githubRoutes(page);
  const names = [
    "gitrew",
    "afterprompt",
    "gitrew-afterprompt-chat",
    "gitrew-afterprompt-vault",
    "gitrew-afterprompt-auth",
  ];
  await page.route(
    "https://api.github.com/user/installations/1/repositories**",
    (route) =>
      route.fulfill({
        json: {
          total_count: names.length,
          repositories: names.map((name, id) => ({
            id: id + 1,
            full_name: `inchidev/${name}`,
            private: name !== "gitrew",
            has_discussions: true,
          })),
        },
      }),
  );
  await page.route("https://api.github.com/repos/*/*/issues**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("https://api.github.com/graphql", (route) => {
    if (route.request().postDataJSON().query.includes("query Projects"))
      return route.fulfill({
        json: { data: { organization: { projectsV2: { nodes: [] } } } },
      });
    return route.fallback();
  });
  const channelReads: string[] = [];
  page.on("request", (request) => {
    if (request.url() !== "https://api.github.com/graphql") return;
    const body = request.postDataJSON();
    if (body.query.includes("query Channels"))
      channelReads.push(body.variables.name);
  });
  await page.goto("/login?workspace=inchidev/gitrew");
  await expect(
    page.getByText("A conversation from GitHub", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Workspaces", exact: true }),
  ).toHaveCount(0);
  await page.goto("/w/inchidev?repo=gitrew-afterprompt-chat");
  await expect(page).toHaveURL(/repo=gitrew-afterprompt-chat/);
  await expect(
    page.getByText("Only the private workspace", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Conversation options" }).click();
  await page.getByRole("menuitem", { name: "Projects and issues" }).click();
  const projects = page.getByRole("dialog", { name: "Projects and issues" });
  await projects.getByRole("combobox", { name: "Project repository" }).click();
  await expect(page.getByRole("option")).toHaveCount(2);
  await expect(
    page.getByRole("option", { name: "inchidev/gitrew", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "inchidev/afterprompt", exact: true }),
  ).toBeVisible();
  expect(channelReads).toContain("gitrew-afterprompt-chat");
  expect(channelReads.some((name) => /-(vault|auth)$/.test(name))).toBe(false);
});
