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
      comments: { totalCount: 2 },
    },
  ],
  pageInfo: { hasNextPage: false, endCursor: null },
};
const commentsPage = {
  comments: [
    {
      id: "C_1",
      body: "First message",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      url: "https://github.com/acme/widget/discussions/1#1",
      author: { login: "robin" },
      replies: {
        nodes: [
          {
            id: "R_1",
            body: "A reply",
            createdAt: "2026-10-01T00:00:00Z",
            updatedAt: "2026-10-01T00:00:00Z",
            url: "https://github.com/acme/widget/discussions/1#r1",
            author: { login: "sam" },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  ],
  pageInfo: { hasNextPage: false, endCursor: null },
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
      return json(discussionsPage);
    if (url.pathname === "/api/public/github/discussions/D_1/comments")
      return json(commentsPage);
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
    page.getByRole("button", { name: /general/ }).first(),
  ).toBeVisible();
  await expect(page.getByText("Welcome", { exact: true })).toBeVisible();
  await expect(page.getByText("First message", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "1 reply" }).click();
  await expect(page.getByText("A reply", { exact: true })).toBeVisible();
  expect(
    apiRequests.every((url) => url.includes("/api/public/github/")),
  ).toBe(true);
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

test("unknown and private spaces look the same", async ({ page }) => {
  await publicRoutes(page);
  await page.goto("/github/ghost");
  await expect(page.getByText("does not exist")).toBeVisible();
  await page.goto("/github/acme/secret");
  await expect(page.getByText("does not exist")).toBeVisible();
});
