import { defineConfig, devices } from "@playwright/test";

/**
 * F01+ functional tests. Run against a production build (`next build` first):
 * `npm run test:e2e`. Requires .env.local (live Supabase): skipped in CI.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3199",
  },
  webServer: {
    command: "npm run start -- -p 3199",
    url: "http://localhost:3199/no/configurator",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: "desktop",
      testMatch: /f\d\d\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      testMatch: /f\d\d\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "evidence",
      testMatch: /evidence\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
