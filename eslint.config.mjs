import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // git worktrees (superpowers) live here and carry their own .next build
      // output → never lint them, even after a stale worktree lingers.
      ".claude/**",
      "**/.next/**",
      // Varco process repo — gitignored, never part of the product, lints
      // with its own rules. Present as a sibling checkout in some working
      // copies (mockup JS, etc.); this repo never sees it on a feature
      // branch, but the ignore stays cheap insurance either way.
      ".varco/**",
    ],
  },
];

export default eslintConfig;
