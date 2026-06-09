import "server-only";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_THEME, type ThemeTokens } from "@/lib/theme";

/**
 * Read the 3 managed theme tokens from `settings` (ADR 0008). Public-readable
 * row (RLS 0002), so the anon cookie-session client is enough. Falls back to the
 * defaults when the row is missing or unreadable. The root layout injects the
 * result on <html>, so a back-office save re-themes the public site on refresh.
 */
export async function getThemeTokens(): Promise<ThemeTokens> {
  try {
    const supabase = await createClient();
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
