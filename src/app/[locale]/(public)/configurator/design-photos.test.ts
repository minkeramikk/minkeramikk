import { describe, it, expect } from "vitest";
import { hasPhotos, photoIndexAt } from "./design-photos";

describe("hasPhotos (F36 step-2 strip guard)", () => {
  it("is false for a MISSING images field (stale pre-F36 cache DTO) — no crash", () => {
    // the bug: detail.images was undefined → detail.images.length threw in the client
    expect(hasPhotos(undefined)).toBe(false);
    expect(hasPhotos(null)).toBe(false);
  });

  it("is false for an empty gallery (design without photos)", () => {
    expect(hasPhotos([])).toBe(false);
  });

  it("is true only when there is at least one photo", () => {
    expect(hasPhotos(["design-photos/x/a.jpg"])).toBe(true);
  });
});

describe("photoIndexAt (F41 lightbox counter)", () => {
  it("rounds to the nearest slide while swiping", () => {
    expect(photoIndexAt(0, 400, 3)).toBe(0);
    expect(photoIndexAt(180, 400, 3)).toBe(0);
    expect(photoIndexAt(240, 400, 3)).toBe(1);
    expect(photoIndexAt(800, 400, 3)).toBe(2);
  });

  it("clamps rubber-band overscroll to the last slide (no 4/3 counter)", () => {
    expect(photoIndexAt(1200, 400, 3)).toBe(2);
    expect(photoIndexAt(-90, 400, 3)).toBe(0);
  });

  it("is 0 before the first layout pass (clientWidth 0 → no division by zero)", () => {
    expect(photoIndexAt(0, 0, 3)).toBe(0);
  });
});
