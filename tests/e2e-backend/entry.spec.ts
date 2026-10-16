import { test, expect } from "@playwright/test";
import { sampleWorkspace } from "./fixtures/workspace";

test("a denied sign-in snapshot explains organization access and rechecks through OAuth with its original destination", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config")
      return route.fulfill({
        json: { configured: true, displayName: "AfterPrompt", sandbox: "" },
      });
    if (path === "/api/session")
      return route.fulfill({ status: 401, json: { error: "Signed out" } });
    if (path === "/api/auth/start")
      return route.fulfill({
        contentType: "text/html",
        body: "GitHub sign-in started",
      });
    if (path === "/api/access")
      return route.fulfill({
        json: {
          viewer: { id: 2, login: "sam" },
          displayName: "AfterPrompt",
          organization: "inchidev",
          checkedAt: new Date().toISOString(),
          canEnter: false,
          isAdmin: false,
          snapshot: true,
          returnTo:
            "/w/inchidev/c/general?repo=gitrew-afterprompt-chat&thread=m1",
          checks: [
            {
              id: "organization",
              label: "GitHub organization",
              status: "missing",
              detail: "Accept your GitHub organization invitation to inchidev.",
            },
            {
              id: "team",
              label: "GitHub team",
              status: "not_checked",
              detail: "Organization access must be confirmed first.",
            },
            {
              id: "chat",
              label: "Chat repository",
              status: "not_checked",
              detail: "Organization and team access must be confirmed first.",
            },
            {
              id: "membership",
              label: "Private conversations and DMs",
              status: "not_checked",
              detail: "Workspace entry must be available first.",
            },
          ],
        },
      });
    throw new Error("Unexpected snapshot request " + path);
  });
  await page.goto("/access/?returnTo=https://attacker.invalid");
  await expect(
    page.getByText("Accept your GitHub organization invitation to inchidev."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open shared channels" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page).toHaveURL(/\/api\/auth\/start\?returnTo=/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(
    "/w/inchidev/c/general?repo=gitrew-afterprompt-chat&thread=m1",
  );
});

test("missing private membership still lets a member open shared channels", async ({
  page,
}) => {
  await sampleWorkspace(page);
  await page.route("**/api/access", (route) =>
    route.fulfill({
      json: {
        viewer: { id: 1, login: "robin" },
        displayName: "AfterPrompt",
        organization: "inchidev",
        checkedAt: new Date().toISOString(),
        canEnter: true,
        isAdmin: false,
        snapshot: false,
        checks: [
          {
            id: "organization",
            label: "GitHub organization",
            status: "passed",
            detail: "Active organization member.",
          },
          {
            id: "team",
            label: "GitHub team",
            status: "passed",
            detail: "Active team member.",
          },
          {
            id: "chat",
            label: "Chat repository",
            status: "passed",
            detail: "Chat Read access confirmed.",
          },
          {
            id: "membership",
            label: "Private conversations and DMs",
            status: "missing",
            detail:
              "Ask a workspace administrator to add your GitHub username in Workspace members. You can still use shared channels.",
          },
        ],
      },
    }),
  );
  await page.goto(
    "/access/?returnTo=" +
      encodeURIComponent(
        "/w/inchidev/c/private-id?repo=gitrew-afterprompt-chat",
      ),
  );
  await expect(
    page.getByText(/You can still use shared channels/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open shared channels" }).click();
  await expect(page.getByRole("heading", { name: "# general" })).toBeVisible();
  await expect(page).not.toHaveURL(/private-id/);
  const sharedLink =
    "/w/inchidev/c/general?repo=gitrew-afterprompt-chat&thread=sample-0";
  await page.goto("/access/?returnTo=" + encodeURIComponent(sharedLink));
  await page.getByRole("button", { name: "Open shared channels" }).click();
  await expect(page).toHaveURL(
    new RegExp(
      "/w/inchidev/c/general\\?repo=gitrew-afterprompt-chat&thread=sample-0$",
    ),
  );
  await expect(page.getByRole("heading", { name: "# general" })).toBeVisible();
});

test("members enter the named chat from root without hosting, workspace switching or administrator settings", async ({
  page,
}) => {
  await sampleWorkspace(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "# general" })).toBeVisible();
  await expect(page.locator(".workspace-title")).toHaveText("AfterPrompt");
  await expect(page.locator(".workspace-title")).not.toHaveAttribute(
    "role",
    "button",
  );
  for (const selector of [
    ".gitrew-landing",
    ".workspace-rail",
    ".toolbar-workspace",
    ".own-client",
  ])
    await expect(page.locator(selector)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Workspace options", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", {
      name: /Create.*workspace|Host your own|About Gitrew/,
    }),
  ).toHaveCount(0);
  await expect(page.locator(".global-search kbd")).toHaveCSS(
    "border-top-width",
    "0px",
  );
  await page.getByRole("button", { name: "User settings" }).click();
  await page.getByRole("menuitem", { name: "Appearance", exact: true }).hover();
  await page
    .getByRole("menuitem", { name: "Light appearance", exact: true })
    .click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.goto("/create/");
  await expect(page.getByRole("heading", { name: "# general" })).toBeVisible();
});

test("administrators can rename a workspace without changing its organization or repository", async ({
  page,
}) => {
  await sampleWorkspace(page, true);
  await page.goto("/");
  await page.getByRole("button", { name: "Workspace options" }).click();
  await page.getByRole("menuitem", { name: "Workspace settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Workspace settings" });
  await dialog
    .getByRole("textbox", { name: "Workspace name" })
    .fill("The AfterPrompt crew");
  await dialog.getByRole("button", { name: "Save name" }).click();
  await expect(page.locator(".workspace-title")).toHaveText(
    "The AfterPrompt crew",
  );
  await page.reload();
  await expect(page.locator(".workspace-title")).toHaveText(
    "The AfterPrompt crew",
  );
  await expect(page).toHaveURL(/\/w\/inchidev.*repo=gitrew-afterprompt-chat/);
});

test("access failures preserve the destination and distinguish missing, unchecked and upstream failures", async ({
  page,
}) => {
  let available = false;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config")
      return route.fulfill({
        json: { configured: true, displayName: "AfterPrompt", sandbox: "" },
      });
    if (path === "/api/session")
      return route.fulfill({
        status: 403,
        json: { error: "Team access required" },
      });
    if (path === "/api/access")
      return route.fulfill({
        json: {
          viewer: { id: 2, login: "sam" },
          displayName: "AfterPrompt",
          organization: "inchidev",
          checkedAt: new Date().toISOString(),
          canEnter: false,
          isAdmin: false,
          snapshot: false,
          checks: [
            {
              id: "organization",
              label: "GitHub organization",
              status: "passed",
              detail: "You are an active member of inchidev.",
            },
            {
              id: "team",
              label: "GitHub team",
              status: available ? "unknown" : "missing",
              detail: available
                ? "Could not verify the GitHub team."
                : "Ask an owner to add you to the afterprompt team.",
            },
            {
              id: "chat",
              label: "Chat repository",
              status: "not_checked",
              detail: "Team access must be confirmed first.",
            },
            {
              id: "membership",
              label: "Private conversations and DMs",
              status: "not_checked",
              detail: "Workspace entry must be available first.",
            },
          ],
        },
      });
    throw new Error("Unexpected access request " + path);
  });
  await page.goto(
    "/w/inchidev/c/general?repo=gitrew-afterprompt-chat&thread=sample-0",
  );
  await expect(
    page.getByRole("heading", { name: "Access to AfterPrompt" }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(
    "/w/inchidev/c/general?repo=gitrew-afterprompt-chat&thread=sample-0",
  );
  await expect(
    page.getByText("Ask an owner to add you to the afterprompt team."),
  ).toBeVisible();
  await expect(page.getByText("Not checked", { exact: true })).toHaveCount(2);
  await expect(page.locator(".gitrew-shell")).toHaveCount(0);
  available = true;
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(
    page.getByText("Couldn’t verify", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Needed", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
