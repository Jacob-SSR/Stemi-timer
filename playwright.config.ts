import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "*.spec.ts",
  timeout: 60000,
  expect: { timeout: 20000 },
  workers: 1,
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3100",
    headless: true,
    launchOptions: { channel: "msedge" },
  },
});
