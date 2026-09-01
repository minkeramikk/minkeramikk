/**
 * R4-MAIL-JOURNEY §E, trap 1: emails are rendered from inside `after()`, where
 * `unstable_cache` throws. `getThemeTokensSafe` used to swallow that and hand
 * back DEFAULT_THEME — every mail would leave in the default purple instead of
 * the shop's brown, silently. These tests pin the real tokens, not "the mail
 * was sent".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();

vi.mock("next/cache", () => ({
  // exactly what Next does outside a request scope
  unstable_cache: () => () => {
    throw new Error("`unstable_cache` cannot be called outside a request scope");
  },
}));

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));

const SHOP = { color_light: "#f4ece7", color_dark: "#3a3230", color_accent: "#8a5a3b" };

describe("getThemeTokensSafe outside a request scope", () => {
  beforeEach(() => {
    vi.resetModules();
    maybeSingle.mockReset();
  });

  it("reads the shop's real tokens instead of falling back to the defaults", async () => {
    maybeSingle.mockResolvedValue({ data: SHOP });
    const { getThemeTokensSafe } = await import("./theme.server");
    await expect(getThemeTokensSafe()).resolves.toEqual({
      light: "#f4ece7",
      dark: "#3a3230",
      accent: "#8a5a3b",
    });
  });

  it("still degrades to the defaults when the database itself is unreachable", async () => {
    maybeSingle.mockRejectedValue(new Error("ECONNREFUSED"));
    const { getThemeTokensSafe } = await import("./theme.server");
    const { DEFAULT_THEME } = await import("./theme");
    await expect(getThemeTokensSafe()).resolves.toEqual(DEFAULT_THEME);
  });
});
