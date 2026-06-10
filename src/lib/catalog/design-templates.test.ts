import { describe, it, expect } from "vitest";
import {
  PALETTE_COLORS,
  LOGO_ASSETS,
  TEMPLATE_META,
  type TemplateKey,
} from "./design-templates";

describe("PALETTE_COLORS (F22 template seed data)", () => {
  it("has 21 entries", () => {
    expect(PALETTE_COLORS).toHaveLength(21);
  });

  it("every entry has name, hex and image", () => {
    for (const c of PALETTE_COLORS) {
      expect(c.name).toBeTruthy();
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.image).toBeTruthy();
    }
  });

  it("image field is the F15 swatches Storage path (not a CDN URL)", () => {
    for (const c of PALETTE_COLORS) {
      expect(c.image).toMatch(/^swatches\/[0-9a-f]{6}\.png$/);
      expect(c.image).not.toMatch(/^https?:\/\//);
    }
  });

  it("Storage path hex matches the option hex", () => {
    for (const c of PALETTE_COLORS) {
      const expectedPath = `swatches/${c.hex.replace(/^#/, "")}.png`;
      expect(c.image).toBe(expectedPath);
    }
  });

  it("no duplicate hexes", () => {
    const hexes = PALETTE_COLORS.map((c) => c.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
  });

  it("no duplicate names", () => {
    const names = PALETTE_COLORS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("LOGO_ASSETS (F22 template seed data)", () => {
  it("has at least 1 entry", () => {
    expect(LOGO_ASSETS.length).toBeGreaterThan(0);
  });

  it("every entry has name and image (CDN URL)", () => {
    for (const l of LOGO_ASSETS) {
      expect(l.name).toBeTruthy();
      expect(l.image).toMatch(/^https?:\/\//);
    }
  });

  it("names do not contain raw prefix like 'Animals-Preview'", () => {
    for (const l of LOGO_ASSETS) {
      expect(l.name).not.toMatch(/Animals-Preview/i);
    }
  });

  it("no duplicate image URLs", () => {
    const urls = LOGO_ASSETS.map((l) => l.image);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("TEMPLATE_META", () => {
  const keys: TemplateKey[] = ["empty", "colors-only", "colors-and-logos"];

  it("has entries for all three template keys", () => {
    for (const k of keys) {
      expect(TEMPLATE_META[k]).toBeDefined();
      expect(TEMPLATE_META[k].title).toBeTruthy();
      expect(TEMPLATE_META[k].description).toBeTruthy();
    }
  });

  it("'colors-only' description mentions the palette count", () => {
    expect(TEMPLATE_META["colors-only"].description).toContain(String(PALETTE_COLORS.length));
  });

  it("'colors-and-logos' description mentions the logo count", () => {
    expect(TEMPLATE_META["colors-and-logos"].description).toContain(String(LOGO_ASSETS.length));
  });
});
