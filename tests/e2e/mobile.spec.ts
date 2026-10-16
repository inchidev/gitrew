import { expect, test, type Page } from "@playwright/test";
import { githubRoutes, session } from "./fixtures/github";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test("desktop install manifest has decodable canonical icons and passes Chrome icon checks", async ({
  page,
  browserName,
}) => {
  await page.route("http://127.0.0.1:5180/config", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await page.goto("/");
  const icons = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    );
    if (!link) throw new Error("Missing app manifest");
    const manifest = await (await fetch(link.href)).json();
    if (
      manifest.id !== "/" ||
      manifest.start_url !== "/login" ||
      manifest.display !== "standalone"
    )
      throw new Error("Unexpected app identity");
    const result: Array<{ size: number; purpose: string }> = [];
    for (const icon of manifest.icons) {
      const image = new Image();
      image.src = new URL(icon.src, link.href).href;
      await image.decode();
      if (
        image.naturalWidth !== image.naturalHeight ||
        icon.sizes !== `${image.naturalWidth}x${image.naturalHeight}`
      )
        throw new Error("Incorrect icon dimensions");
      result.push({ size: image.naturalWidth, purpose: icon.purpose });
    }
    const apple = document.querySelector<HTMLLinkElement>(
      'link[rel="apple-touch-icon"]',
    );
    if (!apple) throw new Error("Missing Apple icon");
    const image = new Image();
    image.src = apple.href;
    await image.decode();
    if (image.naturalWidth !== 180 || image.naturalHeight !== 180)
      throw new Error("Incorrect Apple icon dimensions");
    return result;
  });
  expect(icons).toEqual(
    expect.arrayContaining([
      { size: 192, purpose: "any" },
      { size: 512, purpose: "any" },
      { size: 512, purpose: "maskable" },
    ]),
  );
  if (browserName === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    const result = await cdp.send("Page.getInstallabilityErrors");
    // Playwright's isolated test context is incognito; that policy is expected.
    expect(
      result.installabilityErrors.filter(
        (error) => error.errorId !== "in-incognito",
      ),
    ).toEqual([]);
  }
});

async function swipe(page: Page, points: Array<[number, number]>) {
  // Exercise the installed DOM listeners. Physical OS gestures need a real device.
  await page.evaluate((path) => {
    const first = path[0]!;
    const target = document.elementFromPoint(first[0], first[1]);
    if (!target) throw new Error("No swipe target");
    for (const [index, point] of path.entries()) {
      const touch = {
        identifier: 1,
        target,
        clientX: point[0],
        clientY: point[1],
      };
      const type = index === 0 ? "touchstart" : "touchmove";
      const send = (name: string, ended = false) => {
        // Desktop WebKit exposes Touch but disallows constructing it. Supply the
        // standard read-only touch lists on a bubbling event in both engines.
        const event = new Event(name, { bubbles: true, cancelable: true });
        Object.defineProperties(event, {
          touches: { value: ended ? [] : [touch] },
          targetTouches: { value: ended ? [] : [touch] },
          changedTouches: { value: [touch] },
        });
        target.dispatchEvent(event);
      };
      send(type);
      if (index === path.length - 1) send("touchend", true);
    }
  }, points);
}

async function openChat(page: Page) {
  await session(page);
  await githubRoutes(page);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "# general" })).toBeVisible();
}

for (const theme of ["dark", "light"] as const) {
  test(`safe areas protect chat, menu and thread controls in ${theme} mode`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openChat(page);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /viewport-fit=cover/,
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      theme === "dark" ? "#151b23" : "#f6f8fa",
    );
    // Chromium does not expose iPhone hardware insets. Inject representative layout inputs.
    await page.addStyleTag({
      content: ":root { --safe-top: 59px; --safe-bottom: 34px; }",
    });
    const brand = await page
      .getByRole("link", { name: "Gitrew home" })
      .boundingBox();
    expect(brand?.y).toBeGreaterThanOrEqual(59);
    const composer = await page
      .locator(".conversation > .composer")
      .boundingBox();
    expect(composer).not.toBeNull();
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(844 - 34 - 12);
    const opener = page.getByRole("button", {
      name: "Open channels",
      exact: true,
    });
    await opener.click();
    await expect
      .poll(
        async () => (await page.locator(".channel-sidebar").boundingBox())?.x,
      )
      .toBe(0);
    const menuTop = await page.locator(".workspace-title").boundingBox();
    expect(menuTop?.y).toBeGreaterThanOrEqual(59);
    const account = await page.locator(".user-bar").boundingBox();
    expect(account!.y + account!.height).toBeLessThanOrEqual(844 - 34);
    expect(
      await page.evaluate(() => {
        const toolbar = document.querySelector(".app-toolbar"),
          menu = document.querySelector(".channel-sidebar");
        if (!toolbar || !menu) throw new Error("Missing navigation");
        return (
          getComputedStyle(toolbar).backgroundColor ===
            getComputedStyle(menu).backgroundColor &&
          getComputedStyle(document.documentElement).backgroundColor ===
            getComputedStyle(toolbar).backgroundColor
        );
      }),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/mobile-safe-areas/${page.context().browser()!.browserType().name()}-${theme}-menu.png`,
    });
    await page
      .getByRole("button", { name: "Close channels", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Reply in thread", exact: true })
      .first()
      .click();
    const close = await page
      .getByRole("button", { name: "Close thread", exact: true })
      .boundingBox();
    expect(close?.y).toBeGreaterThanOrEqual(59);
    const reply = await page.locator(".thread-panel .composer").boundingBox();
    expect(reply!.y + reply!.height).toBeLessThanOrEqual(844 - 34 - 12);
    await expect(page.locator(".thread-panel")).toHaveCSS("opacity", "1");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `artifacts/mobile-safe-areas/${page.context().browser()!.browserType().name()}-${theme}-thread.png`,
    });
    await page
      .getByRole("button", { name: "Close thread", exact: true })
      .click();
    await expect(page.locator(".thread-panel")).toHaveCount(0);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.addStyleTag({
      content:
        ":root { --safe-top: 0px; --safe-left: 59px; --safe-right: 34px; --safe-bottom: 21px; }",
    });
    const workspace = await page.locator(".workspace-title").boundingBox();
    expect(workspace?.x).toBeGreaterThanOrEqual(59);
    const landscapeComposer = await page
      .locator(".conversation > .composer")
      .boundingBox();
    expect(landscapeComposer!.x + landscapeComposer!.width).toBeLessThanOrEqual(
      844 - 34,
    );
    expect(
      landscapeComposer!.y + landscapeComposer!.height,
    ).toBeLessThanOrEqual(390 - 21);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });
}

test("channel swipes open and close without taking over scrolling, editing or threads", async ({
  page,
}) => {
  await openChat(page);
  const opener = page.getByRole("button", {
    name: "Open channels",
    exact: true,
  });
  await swipe(page, [
    [50, 350],
    [100, 352],
    [180, 355],
  ]);
  await expect(opener).toHaveAttribute("aria-expanded", "true");
  await swipe(page, [
    [200, 350],
    [150, 352],
    [50, 355],
  ]);
  await expect(opener).toHaveAttribute("aria-expanded", "false");
  for (const path of [
    [
      [50, 350],
      [52, 390],
      [180, 395],
    ], // vertical intent wins, even if it later turns right
    [
      [5, 350],
      [100, 352],
      [180, 355],
    ], // OS/browser edge
    [
      [180, 350],
      [250, 352],
      [320, 355],
    ], // ordinary content away from the opening gutter
    [
      [50, 350],
      [75, 352],
      [90, 355],
    ], // insufficient travel
  ] satisfies Array<Array<[number, number]>>) {
    await swipe(page, path);
    await expect(opener).toHaveAttribute("aria-expanded", "false");
  }
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await input.fill("Keep this draft");
  const box = await input.boundingBox();
  await swipe(page, [
    [50, box!.y + 10],
    [100, box!.y + 10],
    [180, box!.y + 10],
  ]);
  await expect(opener).toHaveAttribute("aria-expanded", "false");
  await expect(input).toHaveValue("Keep this draft");
  await page
    .getByRole("button", { name: "Reply in thread", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Close thread", exact: true }),
  ).toBeVisible();
  await swipe(page, [
    [50, 350],
    [100, 352],
    [180, 355],
  ]);
  await expect(opener).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("button", { name: "Close thread" }),
  ).toBeVisible();
});

test("sign-in safe areas and browser colors follow the explicit app theme", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.route("http://127.0.0.1:5180/config", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await page.goto("/login");
  await page.addStyleTag({
    content: ":root { --safe-top: 59px; --safe-bottom: 34px; }",
  });
  const theme = page.getByRole("button", { name: "Toggle color theme" });
  expect((await theme.boundingBox())?.y).toBeGreaterThanOrEqual(79);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#0d1117",
  );
  await theme.click();
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#ffffff",
  );
  const footer = await page.locator(".auth-page-footer").boundingBox();
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(844 - 34);
});
