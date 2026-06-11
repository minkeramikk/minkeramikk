import { describe, it, expect } from "vitest";
import {
  assetClass,
  isVariantPath,
  variantPath,
  variantWidth,
} from "./asset-variants";

describe("assetClass", () => {
  it("classifies every F26 class by path prefix", () => {
    expect(assetClass("swatches/a3759f.png")).toBe("swatches");
    expect(assetClass("products/middagstallerken.png")).toBe("products");
    expect(assetClass("designs/amalfi-dyr/dots/lilla.png")).toBe("designs");
    expect(assetClass("designs/amalfi-dyr/preview.png")).toBe("designs");
  });

  it("matches animal icons under both 'dyr' (F22 template) and 'animal' slugs", () => {
    expect(assetClass("designs/amalfi/dyr/elg.png")).toBe("animal");
    expect(assetClass("designs/amalfi/animal/elg.png")).toBe("animal");
  });

  it("keeps animal COMPOSITING LAYERS in the designs class (512, not 128)", () => {
    // composed in the hero preview — 128 would blur them
    expect(assetClass("designs/amalfi/animal/elg-layer.png")).toBe("designs");
    expect(assetClass("designs/amalfi-dyr/animal/krabbeamalfi-shape.png")).toBe(
      "designs"
    );
    expect(assetClass("designs/amalfi/dyr/elg-layer.png")).toBe("designs");
    expect(variantWidth("designs/amalfi/animal/elg-shape.png")).toBe(512);
  });

  it("returns null for external URLs, existing variants and unknown prefixes", () => {
    expect(assetClass("https://cdn.example.com/x.png")).toBeNull();
    expect(assetClass("swatches/a3759f@96.webp")).toBeNull();
    expect(assetClass("misc/whatever.png")).toBeNull();
  });
});

describe("variantWidth", () => {
  it("maps each class to its display-derived width", () => {
    expect(variantWidth("swatches/a3759f.png")).toBe(96);
    expect(variantWidth("designs/amalfi/dyr/elg.png")).toBe(128);
    expect(variantWidth("products/krus.png")).toBe(256);
    expect(variantWidth("designs/amalfi/dots/lilla.png")).toBe(512); // F26.1: was 800
    expect(variantWidth("misc/x.png")).toBeNull();
  });
});

describe("variantPath", () => {
  it("replaces the image extension with @<width>.webp, next to the master", () => {
    expect(variantPath("swatches/a3759f.png", 96)).toBe("swatches/a3759f@96.webp");
    expect(variantPath("designs/amalfi-dyr/dots/lilla.png", 512)).toBe(
      "designs/amalfi-dyr/dots/lilla@512.webp"
    );
    expect(variantPath("products/foto.jpg", 256)).toBe("products/foto@256.webp");
  });

  it("returns null when there is no image extension to replace", () => {
    expect(variantPath("misc/readme.txt", 96)).toBeNull();
    expect(variantPath("designs/amalfi/folder", 800)).toBeNull();
  });
});

describe("isVariantPath", () => {
  it("recognizes the @<n>.webp suffix", () => {
    expect(isVariantPath("swatches/a3759f@96.webp")).toBe(true);
    expect(isVariantPath("swatches/a3759f.png")).toBe(false);
    expect(isVariantPath("designs/a/b/c@800.webp")).toBe(true);
  });
});
