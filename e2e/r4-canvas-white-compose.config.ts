import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Config dedicata al compositore di evidenza R4-CANVAS-WHITE: `compose-plate.ts`
 * è `import "server-only"`, che fuori da un Server Component lancia — serve lo
 * stesso stub della suite unit. Non è nella `vitest.config.ts` principale
 * apposta: `npm test` non deve scaricare asset da Storage.
 *   npx vitest run --config e2e/r4-canvas-white-compose.config.ts
 */
const repo = fileURLToPath(new URL("..", import.meta.url));
export default defineConfig({
  root: repo,
  resolve: {
    alias: {
      "@": `${repo}src`,
      "server-only": `${repo}test/stubs/server-only.ts`,
    },
  },
  test: {
    include: ["e2e/r4-canvas-white-compose.test.ts"],
    testTimeout: 120_000,
  },
});
