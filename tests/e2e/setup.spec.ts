import { test, expect } from "@playwright/test";

test("static setup directs owners to private backend deployments on desktop and phone", async ({
  page,
}) => {
  await page.route("https://api.github.com/**", (route) =>
    route.fulfill({ status: 404, json: {} }),
  );
  await page.goto("/create/");
  await expect(
    page.getByRole("heading", {
      name: "Create your own workspace",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Private repositories need the backend setup", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Authorize Gitrew Creator", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Cloudflare/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Vercel/ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Create your own workspace",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
