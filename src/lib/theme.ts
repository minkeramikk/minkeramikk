/**
 * Theme tokens (ADR 0008): the 3 colors the shop owner manages from the
 * back-office, persisted in the `settings` table. This module is pure and
 * client-safe (the editor imports DEFAULT_THEME for "reset"); the DB read lives
 * in `theme.server.ts` (`getThemeTokens`).
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
