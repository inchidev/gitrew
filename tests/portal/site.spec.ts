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
  await expect(
    page.getByRole("link", { name: "Set up with GitHub" }),
  ).toHaveAttribute("href", "/create/");
  await page
    .getByRole("link", { name: "Create your workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Create your workspace", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Deploy to Cloudflare", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Deploy to VPS", exact: true }),
  ).toBeVisible();
  const address = page.getByRole("textbox", { name: "Workspace address" });
  await address.fill("https://gitrew.example.com");
  await expect(
    page.getByRole("link", { name: "Continue setup on your domain" }),
  ).toHaveAttribute("href", "https://gitrew.example.com/create/");
  await address.fill("javascript:alert(1)");
  await expect(
    page.getByRole("button", { name: "Continue setup on your domain" }),
  ).toBeDisabled();
  await address.fill("https://gitrew.com");
  await expect(
    page.getByRole("button", { name: "Continue setup on your domain" }),
  ).toBeDisabled();
  expect(apiRequests).toEqual([]);
  for (const path of [
    "/api/config",
    "/api/session",
    "/w/inchidev",
    "/login",
    "/manifest.webmanifest",
    "/sw.js",
  ]) {
    expect((await request.get(path)).status()).toBe(404);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/create/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/portal-create-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.screenshot({
    path: "test-results/portal-landing-desktop.png",
    fullPage: true,
  });
});
