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
  // tsconfig keeps jsx: "preserve" for Next's own compiler; a unit test that
  // renders a component to a string needs the transform done here instead.
  // (Vite 8 transforms with oxc, so this is the `esbuild` option's successor.)
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    // unit/integration tests only — e2e/*.spec.ts belongs to Playwright
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
