import { describe, it, expect, beforeAll } from "vitest";
import { assetUrl } from "./storage";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
});

describe("assetUrl", () => {
  it("serves the plain public object (correct aspect ratio)", () => {
    expect(assetUrl("designs/juletre/borders/lilla.png")).toBe(
      "https://example.supabase.co/storage/v1/object/public/assets/designs/juletre/borders/lilla.png"
    );
  });

  it("does NOT use the render/image transform (it distorts square sources)", () => {
    // regression: render/image ?width=N returned 800×1500 from a 1500² source,
    // clipping round borders in the compositing preview.
    expect(assetUrl("x.png", { width: 800 })).not.toContain("render/image");
    expect(assetUrl("x.png", { width: 800 })).not.toContain("width=");
  });
});
