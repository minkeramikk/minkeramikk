import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // unit/integration tests only — e2e/*.spec.ts belongs to Playwright
    include: ["src/**/*.test.ts"],
  },
});
