import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/portal",
  use: {
    baseURL: "http://127.0.0.1:5189",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: "npm run build:portal && node tests/serve-static.mjs",
    url: "http://127.0.0.1:5189",
    env: {
      PORT: "5189",
      NUXT_BUILD_DIR: ".nuxt-portal-e2e",
      PORTAL_TEST: "true",
    },
    timeout: 120_000,
  },
});
