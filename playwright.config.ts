import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:5179",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: "npm run build && node tests/serve-static.mjs",
    url: "http://127.0.0.1:5179",
    reuseExistingServer: !process.env.CI,
    env: {
      NUXT_PUBLIC_OAUTH_BROKER_URL: "http://127.0.0.1:5180",
      NUXT_BUILD_DIR: ".nuxt-e2e",
    },
    timeout: 120_000,
  },
});
