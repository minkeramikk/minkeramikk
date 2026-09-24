import { describe, it, expect } from "vitest";
import { isCustomThumb } from "./featured";

describe("isCustomThumb", () => {
  it("recognizes a custom upload (token before the extension)", () => {
    expect(isCustomThumb("featured/x.custom-ab12cd34.webp")).toBe(true);
    expect(isCustomThumb("featured/x.custom.webp")).toBe(true);
  });

  it("leaves the composed thumb round", () => {
    expect(isCustomThumb("featured/x.webp")).toBe(false);
    expect(isCustomThumb("products/mug.png")).toBe(false);
  });
});
