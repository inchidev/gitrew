import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e-backend",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:5182",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: "npm run build:worker && node tests/serve-static.mjs",
    url: "http://127.0.0.1:5182",
    reuseExistingServer: false,
    env: { PORT: "5182", NUXT_BUILD_DIR: ".nuxt-backend-e2e" },
    timeout: 120_000,
  },
});
