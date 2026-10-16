// Capture the shipped UI using sample API responses, never production sessions.
// Run npm run build, then node tests/serve-static.mjs in another terminal.
// Requires Node 24 (native TypeScript stripping for the shared browser fixture).
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { githubRoutes, session } from "../tests/e2e/fixtures/github.ts";

const origin = process.argv[2] || "http://127.0.0.1:5179";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Capture only a local build with sample data.");
await mkdir("public/images", { recursive: true });
await mkdir("output/product-screenshots", { recursive: true });
const browser = await chromium.launch();
try {
  for (const theme of ["light", "dark"]) {
    for (const mobile of [false, true]) {
      const page = await browser.newPage({
        viewport: mobile
          ? { width: 390, height: 660 }
          : { width: 900, height: 680 },
        deviceScaleFactor: 2,
        colorScheme: theme,
        timezoneId: "UTC",
      });
      await page.addInitScript(
        (value) => localStorage.setItem("nuxt-color-mode", value),
        theme,
      );
      await session(page);
      // Sample identities have no production avatars; exercise the UI fallback.
      await page.route("https://github.com/*.png?*", (route) => route.abort());
      const messages = await githubRoutes(page);
      messages.splice(0);
      const samples = [
        ["robin", "Morning, crew. The new docs are ready for a look."],
        ["sam", "Reading them now. The installation steps are much clearer."],
        ["robin", "Thanks! I added the backup steps too."],
        ["sam", "Let’s try a fresh install together before we share it."],
        ["robin", "Sounds good. I’ll post the results here."],
      ];
      for (const [index, [login, body]] of samples.entries()) {
        const timestamp = `2026-10-16T09:${10 + index * 3}:00Z`;
        messages.push({
          id: `sample-${index}`,
          body,
          createdAt: timestamp,
          updatedAt: timestamp,
          url: `https://github.com/inchidev/gitrew/discussions/1#sample-${index}`,
          author: { login },
          replies: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        });
      }
      messages[0].replies.nodes.push({
        id: "sample-reply",
        body: "I can check the Cloudflare steps this afternoon.",
        createdAt: "2026-10-16T09:12:00Z",
        updatedAt: "2026-10-16T09:12:00Z",
        url: "https://github.com/inchidev/gitrew/discussions/1#sample-reply",
        author: { login: "sam" },
      });
      await page.goto(`${origin}/login`);
      await page
        .getByRole("textbox", { name: "Message", exact: true })
        .waitFor();
      await page.getByText(samples[4][1], { exact: true }).waitFor();
      await page.waitForFunction(
        () => document.querySelectorAll(".message-avatar img").length === 0,
      );
      await page.evaluate(() => document.fonts.ready);
      const name = `gitrew-chat-${theme}${mobile ? "-mobile" : ""}`;
      const buffer = await page.screenshot({
        path: `output/product-screenshots/${name}.png`,
      });
      await sharp(buffer)
        .webp({ quality: 88 })
        .toFile(`public/images/${name}.webp`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
