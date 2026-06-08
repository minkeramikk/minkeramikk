import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // server modules legitimately `import "server-only"`; stub it for tests
      "server-only": fileURLToPath(
        new URL("./test/stubs/server-only.ts", import.meta.url)
      ),
    },
  },
  test: {
    // unit/integration tests only — e2e/*.spec.ts belongs to Playwright
    include: ["src/**/*.test.ts"],
  },
});
