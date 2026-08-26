import { describe, expect, it } from "vitest";
import { displayPhotos, orderedProductPhotos } from "./product-photos";

describe("orderedProductPhotos", () => {
  it("sorts by sort_order and caps at 2", () => {
    expect(
      orderedProductPhotos([
        { image: "c.jpg", sort_order: 2 },
        { image: "a.jpg", sort_order: 0 },
        { image: "b.jpg", sort_order: 1 },
      ])
    ).toEqual(["a.jpg", "b.jpg"]);
  });

  it("survives an absent relation (stale cache entry)", () => {
    expect(orderedProductPhotos(undefined)).toEqual([]);
    expect(orderedProductPhotos(null)).toEqual([]);
  });
});

describe("displayPhotos", () => {
  it("prefers the gallery photos", () => {
    expect(displayPhotos(["a.jpg", "b.jpg"], "products/x.png")).toEqual(["a.jpg", "b.jpg"]);
  });

  it("falls back to the catalog thumb when there is no photo yet", () => {
    expect(displayPhotos([], "products/x.png")).toEqual(["products/x.png"]);
    expect(displayPhotos(undefined, "products/x.png")).toEqual(["products/x.png"]);
  });

  it("returns nothing when there is neither a photo nor a thumb", () => {
    expect(displayPhotos([], null)).toEqual([]);
  });
});
