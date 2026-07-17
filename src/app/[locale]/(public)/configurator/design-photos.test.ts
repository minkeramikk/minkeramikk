import { describe, it, expect } from "vitest";
import { hasPhotos } from "./design-photos";

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
