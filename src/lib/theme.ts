/**
 * Theme tokens (ADR 0008): the 3 colors the shop owner manages from the
 * back-office. Persisted in the `settings` table; until the database
 * lands (TODO 1.1–1.2) we serve the defaults.
 */

export interface ThemeTokens {
  light: string;
  dark: string;
  accent: string;
}

export const DEFAULT_THEME: ThemeTokens = {
  light: "#fbe9e4",
  dark: "#2b2330",
  accent: "#7d4f9c",
};

export async function getThemeTokens(): Promise<ThemeTokens> {
  // TODO(F11): read from Supabase `settings` (single row) with the
  // server client; fall back to DEFAULT_THEME when unset.
  return DEFAULT_THEME;
}
