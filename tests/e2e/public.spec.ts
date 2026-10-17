import { expect, test, type Page } from "@playwright/test";

const ownerPage = {
  login: "acme",
  type: "organization",
  repositories: [
    {
      name: "widget",
      description: "Widgets",
      stargazerCount: 42,
      hasDiscussionsEnabled: true,
    },
    {
      name: "legacy",
      description: null,
      stargazerCount: 3,
      hasDiscussionsEnabled: false,
    },
  ],
  pageInfo: { hasNextPage: true, endCursor: "repos-cursor-1" },
};
const ownerPage2 = {
  ...ownerPage,
  repositories: [
    {
      name: "gadget",
      description: "Gadgets",
      stargazerCount: 7,
      hasDiscussionsEnabled: true,
    },
  ],
  pageInfo: { hasNextPage: false, endCursor: null },
};
const repoMeta = {
  description: "Widgets",
  stargazerCount: 42,
  hasDiscussionsEnabled: true,
  url: "https://github.com/acme/widget",
};
const legacyMeta = {
  description: null,
  stargazerCount: 3,
  hasDiscussionsEnabled: false,
  url: "https://github.com/acme/legacy",
};
const discussionsPage = {
  discussions: [
    {
      id: "D_1",
      title: "#general",
      body: "Welcome",
      url: "https://github.com/acme/widget/discussions/1",
      createdAt: "2026-10-01T00:00:00Z",
      category: { name: "Announcements", emoji: "📣" },
      activityAt: "2026-10-01T00:00:00Z",
      comments: { totalCount: 2 },
    },
    {
      id: "D_2",
      title: "#ideas",
      body: "Ideas talk",
      url: "https://github.com/acme/widget/discussions/2",
      createdAt: "2026-10-02T00:00:00Z",
      category: { name: "Ideas", emoji: "💡" },
      activityAt: "2026-10-02T00:00:00Z",
      comments: { totalCount: 1 },
    },
  ],
  pageInfo: { hasNextPage: true, endCursor: "disc-cursor-1" },
};
const discussionsPage2 = {
  discussions: [
    {
      id: "D_3",
      title: "#third",
      body: "Third channel",
      url: "https://github.com/acme/widget/discussions/3",
      createdAt: "2026-10-03T00:00:00Z",
      category: null,
      comments: { totalCount: 0 },
    },
  ],
  pageInfo: { hasNextPage: false, endCursor: null },
};
const commentsPage = {
  comments: [
    {
      id: "C_1",
      body: "First message\n\n```ts\nconst app = 1;\n```\n\n## Notes\n- pretty\n- neat\n\n<style>hack()</style>",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      url: "https://github.com/acme/widget/discussions/1#1",
      author: { login: "robin" },
      reactions: [
        { emoji: "👍", count: 2 },
        { emoji: "🚀", count: 3 },
      ],
      replies: {
        nodes: [
          {
            id: "R_1",
            body: "A reply",
            createdAt: "2026-10-01T00:00:00Z",
            updatedAt: "2026-10-01T00:00:00Z",
            url: "https://github.com/acme/widget/discussions/1#r1",
            author: { login: "sam" },
            reactions: [{ emoji: "👀", count: 1 }],
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  ],
  pageInfo: { hasPreviousPage: true, startCursor: "comments-cursor-0" },
};
const olderCommentsPage = {
  comments: [
    {
      id: "C_0",
      body: "Ancient message",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
      url: "https://github.com/acme/widget/discussions/1#0",
      author: { login: "founding" },
      reactions: [],
      replies: { nodes: [] },
    },
  ],
  pageInfo: { hasPreviousPage: false, startCursor: "comments-start-0" },
};
const ideasCommentsPage = {
  comments: [
    {
      id: "C_2",
      body: "An idea",
      createdAt: "2026-10-02T00:00:00Z",
      updatedAt: "2026-10-02T00:00:00Z",
      url: "https://github.com/acme/widget/discussions/2#1",
      author: { login: "makers" },
      reactions: [],
      replies: { nodes: [] },
    },
  ],
  pageInfo: { hasPreviousPage: false, startCursor: "ideas-cursor-0" },
};

async function publicRoutes(page: Page) {
  await page.route("**/api/public/**", (route) => {
    const url = new URL(route.request().url());
    const json = (data: unknown, status = 200) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
        status,
      });
    if (url.pathname === "/api/public/github/acme")
      return json(
        url.searchParams.get("after") === "repos-cursor-1"
          ? ownerPage2
          : ownerPage,
      );
    if (url.pathname === "/api/public/github/ghost") return json({}, 404);
    if (url.pathname === "/api/public/github/acme/widget") return json(repoMeta);
    if (url.pathname === "/api/public/github/acme/legacy") return json(legacyMeta);
    if (url.pathname === "/api/public/github/acme/secret")
      return json({ error: "Unknown repository." }, 404);
    if (url.pathname === "/api/public/github/acme/widget/discussions")
      return json(
        url.searchParams.get("after") === "disc-cursor-1"
          ? discussionsPage2
          : discussionsPage,
      );
    if (url.pathname === "/api/public/github/discussions/D_1/comments")
      return json(
        url.searchParams.get("before")
          ? olderCommentsPage
          : commentsPage,
      );
    if (url.pathname === "/api/public/github/discussions/D_2/comments")
      return json(ideasCommentsPage);
    return json({}, 404);
  });
}

test("public index opens an owner space from a name", async ({ page }) => {
  await publicRoutes(page);
  await page.goto("/github/");
  await page.getByLabel("GitHub user or organization").fill("nope!");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByText("Enter a GitHub user or organization name."),
  ).toBeVisible();
  await page.getByLabel("GitHub user or organization").fill("acme");
  await page.getByLabel("Repository (optional)").fill("widget");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL("/github/acme/widget");
});

test("owner space lists repositories and loads more", async ({ page }) => {
  await publicRoutes(page);
  await page.goto("/github/acme");
  await expect(
    page.getByRole("link", { name: /widget/ }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load more repositories" }).click();
  await expect(page.getByRole("link", { name: /gadget/ })).toBeVisible();
});

test("repository space reads discussions and threads without signing in", async ({
  page,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await publicRoutes(page);
  await page.goto("/github/acme/widget");
  await expect(
    page.getByRole("button", { name: "# general", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Welcome", { exact: true })).toBeVisible();
  await expect(page.getByText("First message", { exact: true })).toBeVisible();
  const body = page.locator(".message-body-md").first();
  await expect(body.locator("code.language-ts")).toHaveText("const app = 1;");
  await expect(body.locator("h4")).toHaveText("Notes");
  await expect(body.locator("li")).toHaveText(["pretty", "neat"]);
  await expect(body.locator("style")).toHaveCount(0);
  await expect(page.getByText("👍 2")).toBeVisible();
  await expect(page.getByText("🚀 3")).toBeVisible();
  await page.getByRole("button", { name: "1 reply" }).click();
  await expect(page.getByText("A reply", { exact: true })).toBeVisible();
  await expect(page.getByText("👀 1")).toBeVisible();
  expect(
    apiRequests.every((url) => url.includes("/api/public/github/")),
  ).toBe(true);
});

test("guest history stays on the first server page", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await publicRoutes(page);
  await page.goto("/github/acme/widget");
  await expect(
    page.getByRole("button", { name: "# general", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("First message", { exact: true })).toBeVisible();
  expect(apiRequests.map((url) => new URL(url).pathname)).toEqual([
    "/api/public/github/acme/widget",
    "/api/public/github/acme/widget/discussions",
    "/api/public/github/discussions/D_1/comments",
  ]);
  expect(
    apiRequests.every((url) => !url.includes("after=") && !url.includes("before=")),
  ).toBe(true);
});

test("sidebar groups categories, filters and loads more channels", async ({
  page,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await publicRoutes(page);
  await page.goto("/github/acme/widget");
  await expect(
    page.getByRole("button", { name: "# general", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("📣 Announcements")).toBeVisible();
  await expect(page.getByText("💡 Ideas")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "# ideas", exact: true }),
  ).toHaveClass(/unread/);
  await expect(
    page.getByRole("button", { name: "# general", exact: true }),
  ).not.toHaveClass(/unread/);
  await page
    .getByLabel("Filter channels", { exact: true })
    .fill("general");
  await expect(
    page.getByRole("button", { name: "# general", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "# ideas", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Filter channels", { exact: true }).fill("");
  await page.getByRole("button", { name: "Load more channels" }).click();
  await page.getByRole("button", { name: "# third", exact: true }).click();
  await expect(page.getByText("Third channel", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("button", { name: "Load more channels" }),
  ).toHaveCount(0);
  await expect(
    apiRequests
      .filter((url) => url.includes("/acme/widget/discussions"))
      .map((url) => new URL(url).search),
  ).toEqual(["", "?after=disc-cursor-1"]);
});

test("cmd-k jumps between discussions", async ({ page }) => {
  await publicRoutes(page);
  await page.goto("/github/acme/widget");
  await expect(
    page.getByRole("button", { name: "# general", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByLabel("Jump to a discussion")).toBeVisible();
  await page.getByLabel("Jump to a discussion").fill("ideas");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/channel=D_2/);
  await expect(page.getByText("An idea", { exact: true })).toBeVisible();
});

test("guest walks a back history of older messages", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) apiRequests.push(request.url());
  });
  await publicRoutes(page);
  await page.goto("/github/acme/widget");
  await expect(page.getByText("First message", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load older messages" }).click();
  await expect(
    page.getByText("Ancient message", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load older messages" }),
  ).toHaveCount(0);
  // Selecting a channel and coming back keeps history already in cache.
  await page.getByRole("button", { name: "# ideas", exact: true }).click();
  await expect(page.getByText("An idea", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "# general", exact: true }).click();
  await expect(page.getByText("Ancient message", { exact: true })).toBeVisible();
  const comments = apiRequests
    .filter((url) => url.includes("/comments"))
    .map((url) => new URL(url).search);
  expect(comments.filter((search) => search.includes("before="))).toEqual([
    "?before=comments-cursor-0",
  ]);
});

test("workspace layout is pinned to the viewport", async ({ page }) => {
  await publicRoutes(page);
  await page.goto("/github/acme/widget");
  await expect(page.getByText("First message", { exact: true })).toBeVisible();
  const layout = await page.evaluate(() => {
    const shell = document.querySelector(".gitrew-shell");
    const pageHeader = document.querySelector(".public-header");
    const sidebar = document.getElementById("channel-navigation");
    const feed = document.querySelector<HTMLElement>(".message-feed");
    return {
      pageOverflow:
        document.documentElement.scrollHeight - window.innerHeight,
      shellHeight: shell?.getBoundingClientRect().height ?? 0,
      headerHeight: pageHeader?.getBoundingClientRect().height ?? 0,
      sidebarHeight: sidebar?.getBoundingClientRect().height ?? 0,
      feedHeight: feed?.getBoundingClientRect().height ?? 0,
      viewport: window.innerHeight,
      feedFitsWithoutScrolling: feed
        ? feed.scrollHeight <= feed.clientHeight
        : false,
      sidebarFitsWithoutScrolling: sidebar
        ? sidebar.scrollHeight <= sidebar.clientHeight
        : false,
    };
  });
  expect(layout.pageOverflow).toBe(0);
  expect(layout.shellHeight + layout.headerHeight).toBe(layout.viewport);
  expect(layout.sidebarHeight).toBeLessThanOrEqual(layout.shellHeight);
  expect(layout.feedHeight).toBeLessThanOrEqual(layout.shellHeight);
  expect(layout.feedFitsWithoutScrolling).toBe(true);
  expect(layout.sidebarFitsWithoutScrolling).toBe(true);
});

test("disabled discussions banner offers a retry", async ({ page }) => {
  let metaHits = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/public/github/acme/legacy")
      metaHits += 1;
  });
  await publicRoutes(page);
  await page.goto("/github/acme/legacy");
  await expect(
    page.getByText("Discussions are off in this repository"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("Discussions are off in this repository"),
  ).toBeVisible();
  expect(metaHits).toBeGreaterThanOrEqual(2);
});

test("repository space searches other organizations", async ({ page }) => {
  await publicRoutes(page);
  await page.goto("/github/acme/widget");
  await page.getByLabel("GitHub user or organization").fill("nope!");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByText("Enter a GitHub user or organization name."),
  ).toBeVisible();
  await page.getByLabel("GitHub user or organization").fill("ghost");
  await page.getByLabel("Repository").fill("");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL("/github/ghost");
  await expect(page.getByText("does not exist")).toBeVisible();
});

test("unknown and private spaces look the same", async ({ page }) => {
  await publicRoutes(page);
  await page.goto("/github/ghost");
  await expect(page.getByText("does not exist")).toBeVisible();
  await page.goto("/github/acme/secret");
  await expect(page.getByText("does not exist")).toBeVisible();
});
