import { describe, it, expect, beforeAll } from "vitest";
import { assetUrl } from "./storage";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
});

describe("assetUrl", () => {
  it("resolves design layers to their @800 webp variant (F26)", () => {
    expect(assetUrl("designs/juletre/borders/lilla.png")).toBe(
      "https://example.supabase.co/storage/v1/object/public/assets/designs/juletre/borders/lilla@800.webp"
    );
  });

  it("resolves each class to its own width", () => {
    expect(assetUrl("swatches/a3759f.png")).toContain("swatches/a3759f@96.webp");
    expect(assetUrl("products/middagstallerken.png")).toContain(
      "products/middagstallerken@256.webp"
    );
    expect(assetUrl("designs/amalfi/dyr/elg.png")).toContain(
      "designs/amalfi/dyr/elg@128.webp"
    );
    expect(assetUrl("designs/amalfi/animal/elg.png")).toContain(
      "designs/amalfi/animal/elg@128.webp"
    );
  });

  it("honours an explicit width override", () => {
    expect(assetUrl("designs/juletre/borders/lilla.png", { width: 400 })).toContain(
      "lilla@400.webp"
    );
  });

  it("serves the master for paths outside the variant classes", () => {
    expect(assetUrl("misc/readme.txt")).toBe(
      "https://example.supabase.co/storage/v1/object/public/assets/misc/readme.txt"
    );
  });

  it("passes absolute CDN URLs through unchanged (F22)", () => {
    expect(assetUrl("https://cdn.example.com/x.png")).toBe(
      "https://cdn.example.com/x.png"
    );
  });

  it("does NOT use the render/image transform (it distorts square sources)", () => {
    // regression: render/image ?width=N returned 800×1500 from a 1500² source,
    // clipping round borders in the compositing preview. Variants are sharp
    // `fit: "inside"` derivatives instead — squares stay square.
    expect(assetUrl("designs/x/y/z.png", { width: 800 })).not.toContain("render/image");
    expect(assetUrl("designs/x/y/z.png", { width: 800 })).not.toContain("width=");
  });
});
