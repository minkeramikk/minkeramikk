import { describe, it, expect } from "vitest";
import {
  checkThemeContrast,
  contrastRatio,
  deriveContrastPairs,
  mixOklab,
  type ThemeTriple,
} from "./theme-contrast";
import { DEFAULT_THEME } from "./theme";

const pair = (t: ThemeTriple, id: "text" | "accent" | "muted") =>
  deriveContrastPairs(t).find((p) => p.id === id)!;

describe("contrastRatio (WCAG 2.1)", () => {
  it("black on white = 21:1; identical colours = 1:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
  it("is order-independent", () => {
    expect(contrastRatio("#2b2330", "#fbe9e4")).toBeCloseTo(
      contrastRatio("#fbe9e4", "#2b2330"),
      6
    );
  });
});

describe("mixOklab (matches CSS color-mix in oklab)", () => {
  it("endpoints round-trip exactly", () => {
    expect(mixOklab("#7d4f9c", "#ffffff", 0)).toBe("#7d4f9c");
    expect(mixOklab("#7d4f9c", "#ffffff", 100)).toBe("#ffffff");
  });
  it("primary-foreground = accent mixed 92% white ≈ #f4f0f7 (matches F15)", () => {
    expect(mixOklab("#7d4f9c", "#ffffff", 92)).toBe("#f4f0f7");
  });
});

describe("default theme passes all three AA pairs", () => {
  it("ok, with text/accent/muted ≥ AA", () => {
    const r = checkThemeContrast(DEFAULT_THEME);
    expect(r.ok).toBe(true);
    expect(r.failures).toHaveLength(0);
    expect(pair(DEFAULT_THEME, "text").ratio).toBeGreaterThan(12);
    expect(pair(DEFAULT_THEME, "accent").ratio).toBeCloseTo(5.38, 1);
    expect(pair(DEFAULT_THEME, "muted").ratio).toBeCloseTo(4.59, 1);
  });
});

describe("each pair flips around the 4.5 boundary", () => {
  it("text — #767676 passes (4.54), #777777 fails (4.48)", () => {
    expect(pair({ light: "#ffffff", dark: "#767676", accent: "#000000" }, "text").passes).toBe(true);
    expect(pair({ light: "#ffffff", dark: "#777777", accent: "#000000" }, "text").passes).toBe(false);
  });
  it("accent — #8a5ca3 passes (4.55), #8e60a6 fails (4.34)", () => {
    expect(pair({ light: "#fbe9e4", dark: "#2b2330", accent: "#8a5ca3" }, "accent").passes).toBe(true);
    expect(pair({ light: "#fbe9e4", dark: "#2b2330", accent: "#8e60a6" }, "accent").passes).toBe(false);
  });
  it("muted — dark #2b2330 passes (4.59), #322938 fails (4.26)", () => {
    expect(pair({ light: "#fbe9e4", dark: "#2b2330", accent: "#5d3a73" }, "muted").passes).toBe(true);
    expect(pair({ light: "#fbe9e4", dark: "#322938", accent: "#5d3a73" }, "muted").passes).toBe(false);
  });
});

describe("checkThemeContrast blocks a failing theme", () => {
  it("a too-light accent fails the accent pair with an accent-specific hint", () => {
    const r = checkThemeContrast({ light: "#fbe9e4", dark: "#2b2330", accent: "#b9a0d6" });
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.id)).toContain("accent");
    expect(r.failures.find((f) => f.id === "accent")!.hint).toMatch(/accent/i);
  });
});
