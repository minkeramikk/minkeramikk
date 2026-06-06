import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // unit/integration tests only — e2e/*.spec.ts belongs to Playwright
    include: ["src/**/*.test.ts"],
  },
});
