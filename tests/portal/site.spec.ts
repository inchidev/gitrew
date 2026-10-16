import { test, expect } from "@playwright/test";

test("product site offers installation without workspace authentication", async ({
  page,
  request,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/"))
      apiRequests.push(r.url());
  });
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
  expect(apiRequests).toEqual([]);
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
      for (const repo of ["nuxt/nuxt", "vuejs/core", "nuxt/ui"]) {
        await expect(
          live.getByRole("link", { name: new RegExp(repo.replace("/", "\\/")) }),
        ).toHaveAttribute("href", `/github/${repo}`);
      }
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
