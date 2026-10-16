import { expect, test } from "@playwright/test";
import { githubRoutes, session } from "./fixtures/github";

test("entry is a dedicated sign-in page and an unavailable OAuth service fails closed", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:5180/config", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Sign in to Gitrew", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".gitrew-shell")).toHaveCount(0);
  await expect(
    page.getByText("Your team’s conversations, in one place.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue with GitHub" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(
    page.getByRole("heading", { name: "Sign in to Gitrew", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".gitrew-shell")).toHaveCount(0);
});

test("sign-in without a workspace stays on entry instead of guessing an organization", async ({
  page,
}) => {
  await session(page);
  await githubRoutes(page);
  await page.goto("/login");
  await expect(page).not.toHaveURL(/\/w\//);
  await expect(
    page.getByRole("heading", { name: "# general" }),
  ).toHaveCount(0);
});

test("authenticated drafts survive reload and offline state preserves the draft", async ({
  page,
  context,
}) => {
  await session(page);
  await githubRoutes(page);
  await page.goto("/login?workspace=inchidev/gitrew");
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await expect(composer).toBeEnabled();
  await composer.fill("Draft for my real workspace");
  await page.reload();
  await expect(composer).toHaveValue("Draft for my real workspace");
  await context.setOffline(true);
  await expect(page.getByRole("status")).toContainText("You’re offline");
  await expect(composer).toHaveValue("Draft for my real workspace");
  await context.setOffline(false);
  await expect(composer).toBeEnabled();
  const search = page.getByRole("searchbox", { name: "Search messages" });
  await search.fill("nothing-will-match-this");
  await expect(page.getByText("No messages match your search.")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).first().click();
  await expect(
    page.getByText("A conversation from GitHub", { exact: true }),
  ).toBeVisible();
});

test("authenticated thread links persist replies and display user HTML as text", async ({
  page,
}) => {
  await session(page);
  await githubRoutes(page);
  await page.goto("/login?workspace=inchidev/gitrew");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Room draft while reading a thread");
  await page
    .getByRole("button", { name: "Reply in thread", exact: true })
    .first()
    .click();
  const malicious = '<img src=x onerror="window.gitrewInjected=true">';
  await page
    .getByRole("textbox", { name: "Reply", exact: true })
    .fill(malicious);
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(
    page.locator(".thread-feed").getByText(malicious, { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => "gitrewInjected" in window)).toBe(false);
  await expect(page).toHaveURL(/thread=remote-1/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Thread", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".thread-feed").getByText(malicious, { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close thread" }).click();
  await expect(page.locator(".thread-panel")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toHaveValue("Room draft while reading a thread");
});

test("authenticated phone navigation and full-screen threads remain usable", async ({
  page,
}) => {
  await session(page);
  await githubRoutes(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login?workspace=inchidev/gitrew");
  await expect(page.getByRole("heading", { name: "# general" })).toBeVisible();
  await page.getByRole("button", { name: "Open channels" }).click();
  await expect(
    page.getByRole("button", { name: "# general", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close channels", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reply in thread", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Thread", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Reply", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
