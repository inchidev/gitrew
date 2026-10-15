import { parseVaultOperation } from "../../shared/vault";
import { test, expect } from "@playwright/test";
import {
  newMailboxKey,
  seal,
  unseal,
  REPLY_PREFIX,
  parseMailboxRequest,
  type MailboxRequest,
} from "../../shared/mailbox";

test("GitHub-only sign-in and private messages keep vault credentials and plaintext out of the public mailbox", async ({
  page,
  context,
}) => {
  const server = await newMailboxKey();
  const config = {
    version: 1,
    repository: "acme/gitrew-auth",
    clientId: "test-app",
    appSlug: "test-app",
    publicKey: server.publicKey,
    vault: "acme/gitrew-vault",
    appId: "123",
    openRegistration: true,
  };
  await page.addInitScript(() => {
    localStorage.setItem("gitrew:auth-repository:v1", "acme/gitrew-auth");
    localStorage.setItem(
      "gitrew:workspaces:v2",
      JSON.stringify({ alice: "acme/legacy-chat" }),
    );
  });
  let request: MailboxRequest | null = null;
  let approved = false;
  let issue = 10;
  const messages: {
    id: string;
    channelId: string;
    parentId: string;
    author: string;
    body: string;
    createdAt: string;
    updatedAt: string;
    status: string;
    url: string;
  }[] = [];
  const replies = new Map<number, string[]>();
  const publicBodies: string[] = [];
  const browserUrls: string[] = [];
  page.on("request", (r) => browserUrls.push(r.url()));
  await context.route(
    "https://github.com/acme/gitrew-auth/issues/new**",
    async (route) => {
      const url = new URL(route.request().url());
      request = parseMailboxRequest(
        url.searchParams.get("title")!,
        url.searchParams.get("body")!,
      );
      await route.fulfill({
        contentType: "text/html",
        body: "<h1>GitHub sign-in request submitted</h1>",
      });
    },
  );
  await context.route("https://github.com/login/device", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>GitHub authorization</h1>",
    }),
  );
  await context.route("https://api.github.com/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname;
    const respond = (value: unknown) => route.fulfill({ json: value });
    if (path === "/repos/acme/gitrew-auth/contents/gitrew-auth.json")
      return respond(config);
    if (path === "/user") return respond({ id: 1, login: "alice" });
    if (path === "/user/installations")
      return respond({ total_count: 0, installations: [] });
    if (path === "/user/installations/1/repositories")
      return respond({
        total_count: 2,
        repositories: [
          {
            id: 1,
            full_name: "acme/gitrew-chat",
            private: false,
            has_discussions: true,
          },
          {
            id: 2,
            full_name: "acme/gitrew-vault",
            private: true,
            has_discussions: true,
          },
        ],
      });
    if (
      path === "/repos/acme/gitrew-auth/issues" &&
      route.request().method() === "GET"
    )
      return respond(
        request ? [{ number: 1, title: "Gitrew auth " + request.id }] : [],
      );
    if (path === "/repos/acme/gitrew-auth/issues/1/comments") {
      const values = request
        ? [
            {
              id: 1,
              body:
                REPLY_PREFIX +
                JSON.stringify(
                  await seal(
                    server.privateKey,
                    server.publicKey,
                    request.publicKey,
                    request.id,
                    {
                      id: request.id,
                      kind: "device",
                      userCode: "ABCD-1234",
                      expiresAt: Date.now() + 600_000,
                    },
                  ),
                ),
            },
          ]
        : [];
      if (approved && request)
        values.push({
          id: 2,
          body:
            REPLY_PREFIX +
            JSON.stringify(
              await seal(
                server.privateKey,
                server.publicKey,
                request.publicKey,
                request.id,
                {
                  id: request.id,
                  kind: "session",
                  accessToken: "user-session-token",
                  expiresAt: Date.now() + 28_800_000,
                  login: "alice",
                  userId: 1,
                },
              ),
            ),
        });
      return respond(values);
    }
    if (
      path === "/repos/acme/gitrew-auth/issues" &&
      route.request().method() === "POST"
    ) {
      const body = route.request().postDataJSON();
      publicBodies.push(body.body);
      const pending = parseMailboxRequest(body.title, body.body);
      const operation = parseVaultOperation(
        await unseal(
          server.privateKey,
          pending.publicKey,
          pending.id,
          pending.payload!,
        ),
      );
      const number = ++issue;
      let result: unknown;
      if (operation.op === "list")
        result = {
          channels: [
            {
              id: "D_private",
              name: "Leadership",
              description: "Private vault conversation",
              kind: "private",
            },
          ],
        };
      else if (operation.op === "join") result = { joined: true };
      else if (operation.op === "read") result = { messages };
      else if (operation.op === "send") {
        const message = {
          id: "M_" + messages.length,
          channelId: "D_private",
          parentId: operation.parentId || "",
          author: "alice",
          body: operation.body!,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: "saved",
          url: "",
        };
        messages.push(message);
        result = { message };
      } else throw new Error("Unexpected vault operation");
      replies.set(number, [
        REPLY_PREFIX +
          JSON.stringify(
            await seal(
              server.privateKey,
              server.publicKey,
              pending.publicKey,
              pending.id,
              {
                id: pending.id,
                kind: "result",
                part: 0,
                total: 1,
                data: JSON.stringify(result),
              },
            ),
          ),
      ]);
      return respond({ number });
    }
    const comment = /\/issues\/(\d+)\/comments$/.exec(path);
    if (comment)
      return respond(
        (replies.get(Number(comment[1])) || []).map((body, i) => ({
          id: i + 1,
          body,
        })),
      );
    if (path === "/graphql") {
      const { query } = route.request().postDataJSON();
      if (query.includes("query Channels"))
        return respond({
          data: {
            repository: {
              discussions: {
                nodes: [
                  {
                    id: "D_public",
                    title: "general",
                    body: "Public conversation",
                    url: "https://github.com/acme/gitrew-chat/discussions/1",
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        });
      if (query.includes("query Messages"))
        return respond({
          data: {
            node: {
              comments: {
                nodes: [],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        });
    }
    throw new Error(`Unexpected browser request: ${path}`);
  });
  await page.goto("/login");
  await expect(page.locator(".message")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Continue with GitHub", exact: true })
    .click();
  const popupPromise = context.waitForEvent("page");
  await page
    .getByRole("link", { name: "Create sign-in request", exact: true })
    .click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await popup.close();
  await expect(page.getByText("ABCD-1234", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.screenshot({
    path: "artifacts/verification/mailbox-device-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  approved = true;
  await expect(
    page.getByRole("button", { name: "Leadership", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "acme", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Leadership", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Leadership", exact: true }),
  ).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Message", exact: true });
  await expect(composer).toBeEnabled();
  await composer.fill("Confidential strategy for the next launch");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("Confidential strategy for the next launch", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/verification/vault-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(composer).toBeVisible();
  await page.screenshot({
    path: "artifacts/verification/vault-phone.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  expect(publicBodies.join()).not.toContain("Confidential strategy");
  expect(publicBodies.join()).not.toContain("user-session-token");
  expect(
    browserUrls.some((url) =>
      new URL(url).pathname.startsWith("/repos/acme/gitrew-vault"),
    ),
  ).toBe(false);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    "user-session-token",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator(".message")).toHaveCount(0);
});

test("a legacy broker session cannot carry over into a configured mailbox", async ({
  page,
}) => {
  const server = await newMailboxKey();
  let reusedLegacyToken = false;
  await page.addInitScript(() => {
    localStorage.setItem("gitrew:auth-repository:v1", "acme/gitrew-auth");
    sessionStorage.setItem(
      "gitrew:github-session:v1",
      JSON.stringify({
        accessToken: "legacy-broker-token",
        expiresAt: Date.now() + 600000,
      }),
    );
  });
  await page.route("https://api.github.com/**", async (route) => {
    if (
      route.request().headers().authorization?.includes("legacy-broker-token")
    )
      reusedLegacyToken = true;
    return route.fulfill({
      json: {
        version: 1,
        repository: "acme/gitrew-auth",
        clientId: "app",
        appSlug: "app",
        publicKey: server.publicKey,
      },
    });
  });
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Continue with GitHub", exact: true }),
  ).toBeVisible();
  expect(reusedLegacyToken).toBe(false);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("gitrew:github-session:v1"),
    ),
  ).toBeNull();
});
