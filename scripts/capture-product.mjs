// Capture the shipped UI using sample API responses, never production sessions.
// Run npm run build:worker, then node tests/serve-static.mjs in another terminal.
// Requires Node 24 (native TypeScript stripping for the shared browser fixture).
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { sampleWorkspace } from "../tests/e2e-backend/fixtures/workspace.ts";

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
      await sampleWorkspace(page);
      await page.goto(`${origin}/`);
      await page
        .getByRole("textbox", { name: "Message", exact: true })
        .waitFor();
      await page
        .getByText("Sounds good. I’ll post the results here.", { exact: true })
        .waitFor();
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
