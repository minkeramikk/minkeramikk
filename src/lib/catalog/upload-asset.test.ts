import { describe, it, expect } from "vitest";
import { cacheBustPath } from "./upload-asset";

describe("cacheBustPath", () => {
  it("inserts a token before the extension", () => {
    expect(cacheBustPath("products/plate.png", "ab12cd34")).toBe(
      "products/plate-ab12cd34.png"
    );
    expect(cacheBustPath("suppliers/s1/colors/0160b2.png", "ff00")).toBe(
      "suppliers/s1/colors/0160b2-ff00.png"
    );
  });

  it("generates a token when none is given (unique path per call)", () => {
    const a = cacheBustPath("products/plate.png");
    const b = cacheBustPath("products/plate.png");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^products\/plate-[0-9a-f]{8}\.png$/);
  });
});
