import { test, expect, type Page } from "@playwright/test";

// Minimal public API for the live nuxt/nuxt workspace embedded on the
// landing; mirrors the shape served by /api/public.
const nuxtMeta = {
  description: "The Intuitive Vue Framework.",
  stargazerCount: 40000,
  hasDiscussionsEnabled: true,
  url: "https://github.com/nuxt/nuxt",
};
const nuxtDiscussions = {
  discussions: [
    {
      id: "D_N1",
      title: "3.14 released",
      body: "Ship notes",
      url: "https://github.com/nuxt/nuxt/discussions/1",
      createdAt: "2026-10-01T00:00:00Z",
      category: { name: "Announcements", emoji: "📣" },
      activityAt: "2026-10-01T00:00:00Z",
      comments: { totalCount: 1 },
    },
  ],
  pageInfo: { hasNextPage: false, endCursor: null },
};
const nuxtComments = {
  comments: [
    {
      id: "C_N1",
      body: "Great release",
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
      url: "https://github.com/nuxt/nuxt/discussions/1#1",
      author: { login: "daniel" },
      reactions: [],
      replies: { nodes: [] },
    },
  ],
  pageInfo: { hasPreviousPage: false, startCursor: null },
};

async function mocknuxtWorkspace(page: Page) {
  await page.route("**/api/public/**", (route) => {
    const url = new URL(route.request().url());
    const json = (data: unknown) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (url.pathname === "/api/public/github/nuxt/nuxt") return json(nuxtMeta);
    if (url.pathname === "/api/public/github/nuxt/nuxt/discussions")
      return json(nuxtDiscussions);
    if (url.pathname === "/api/public/github/discussions/D_N1/comments")
      return json(nuxtComments);
    return route.fulfill(
      { contentType: "application/json", body: "{}", status: 404 });
  });
}

test("product site offers installation without workspace authentication", async ({
  page,
  request,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/"))
      apiRequests.push(r.url());
  });
  await mocknuxtWorkspace(page);
  await page.goto("/");
  await expect(page.locator('a[href="/login"]')).toHaveCount(0);
  await expect(page.locator('a[href="/create/"]')).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Create workspace", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Set up a workspace", exact: true }),
  ).toHaveCount(0);
  const install = page.getByRole("link", {
    name: "Install yours",
    exact: true,
  });
  await expect(install).toHaveCount(3);
  for (const link of await install.all())
    await expect(link).toHaveAttribute("href", "#install");
  await page
    .getByRole("link", { name: "Install yours", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/#install$/);
  await expect(page.locator("#install")).toBeInViewport();
  await expect(
    page.getByRole("link", { name: "Deploy to Cloudflare", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Deploy to VPS", exact: true }),
  ).toBeVisible();
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain(
    "/create/",
  );
  expect(
    apiRequests.filter(
      (url) => !new URL(url).pathname.startsWith("/api/public/"),
    ),
  ).toEqual([]);
  for (const path of [
    "/api/config",
    "/api/session",
    "/api/access",
    "/access/",
    "/create",
    "/create/",
    "/w/inchidev",
    "/login",
    "/manifest.webmanifest",
    "/sw.js",
  ]) {
    expect((await request.get(path)).status()).toBe(404);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("nav .install-link")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/portal-landing-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const live = page.locator(".live-workspace");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (value) => localStorage.setItem("nuxt-color-mode", value),
        theme,
      );
      await page.reload();
      await expect(live).toBeVisible();
      // The hero embeds the real read-only nuxt/nuxt workspace with
      // mocked public API data.
      await expect(live.locator(".gitrew-shell")).toBeAttached();
      await expect(live.getByText("Ship notes")).toBeVisible();
    }
  }
  await page.screenshot({
    path: "test-results/portal-landing-desktop.png",
    fullPage: true,
  });
});

test("landing showcases guest communities", async ({ page }) => {
  await page.goto("/");
  const card = page
    .locator("#communities")
    .getByRole("link", { name: /nuxt\/nuxt/ });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL("/github/nuxt/nuxt");
});
