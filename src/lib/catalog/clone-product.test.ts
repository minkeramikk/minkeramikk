import { describe, it, expect } from "vitest";
import {
  buildProductClone,
  nameClashes,
  type CloneSource,
} from "./clone-product";

const src: CloneSource = {
  name_no: "Kopp",
  name_en: "Mug",
  description_no: "En kopp",
  description_en: "A mug",
  price_cents: 24900,
  currency: "NOK",
  image: "products/kopp-a1b2c3d4.png",
  pieces: 2,
};

describe("buildProductClone", () => {
  it("copies every catalog column verbatim", () => {
    const row = buildProductClone(src, "supplier-b", [], 5);
    expect(row.name_no).toBe("Kopp");
    expect(row.name_en).toBe("Mug");
    expect(row.description_no).toBe("En kopp");
    expect(row.description_en).toBe("A mug");
    expect(row.price_cents).toBe(24900);
    expect(row.currency).toBe("NOK");
    expect(row.pieces).toBe(2);
  });

  it("shares the source Storage path (v1: same asset, no copy)", () => {
    expect(buildProductClone(src, "supplier-b", [], 0).image).toBe(
      "products/kopp-a1b2c3d4.png"
    );
  });

  it("points the clone at the target supplier", () => {
    expect(buildProductClone(src, "supplier-b", [], 0).supplier_id).toBe("supplier-b");
  });

  it("lands as a hidden draft", () => {
    expect(buildProductClone(src, "supplier-b", [], 0).visible).toBe(false);
  });

  it("takes the sort_order it is given (tail of the target group)", () => {
    expect(buildProductClone(src, "supplier-b", [], 7).sort_order).toBe(7);
  });

  it("slugifies the Norwegian name", () => {
    expect(buildProductClone(src, "supplier-b", [], 0).slug).toBe("kopp");
  });

  it("suffixes the slug when it collides", () => {
    expect(buildProductClone(src, "supplier-b", ["kopp"], 0).slug).toBe("kopp-2");
    expect(buildProductClone(src, "supplier-b", ["kopp", "kopp-2"], 0).slug).toBe("kopp-3");
  });

  it("folds Norwegian characters in the slug", () => {
    const no = { ...src, name_no: "Bolle på fatet" };
    expect(buildProductClone(no, "supplier-b", [], 0).slug).toBe("bolle-pa-fatet");
  });

  it("carries null descriptions through as null", () => {
    const bare = { ...src, description_no: null, description_en: null };
    const row = buildProductClone(bare, "supplier-b", [], 0);
    expect(row.description_no).toBeNull();
    expect(row.description_en).toBeNull();
  });

  it("never carries an id", () => {
    expect("id" in buildProductClone(src, "supplier-b", [], 0)).toBe(false);
  });
});

describe("nameClashes", () => {
  it("flags a name the target supplier already has, ignoring case and padding", () => {
    expect(nameClashes("Kopp", ["  kopp "])).toBe(true);
  });
  it("does not flag a fresh name", () => {
    expect(nameClashes("Kopp", ["Fat", "Skål"])).toBe(false);
  });
});
