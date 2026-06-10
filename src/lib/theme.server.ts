import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { DEFAULT_THEME, type ThemeTokens } from "@/lib/theme";

/**
 * Read the 3 managed theme tokens from `settings` (ADR 0008). The row is
 * public-readable (RLS 0002), so we use the session-less ANON client — no
 * per-pageview JWT refresh (PERF-1 / P-5). Falls back to defaults when missing.
 */
async function loadThemeTokens(): Promise<ThemeTokens> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("settings")
      .select("color_light, color_dark, color_accent")
      .eq("id", 1)
      .maybeSingle();
    if (data) {
      return {
        light: data.color_light,
        dark: data.color_dark,
        accent: data.color_accent,
      };
    }
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT_THEME;
}

/**
 * Cached under the `theme` tag: the root layout injects this on <html> for every
 * pageview, so a single cached read replaces a per-request query + JWT refresh.
 * `updateTheme` (F11a) calls `revalidateTag("theme")` so a back-office save
 * re-themes the public site on the next load.
 */
export const getThemeTokens = unstable_cache(loadThemeTokens, ["theme-tokens"], {
  tags: ["theme"],
});
