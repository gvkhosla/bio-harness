import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./browser",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4311",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run demo:web",
    env: { BIO_DEMO_PORT: "4311" },
    url: "http://127.0.0.1:4311",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
