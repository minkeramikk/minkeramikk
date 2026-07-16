import { describe, it, expect } from "vitest";
import { parseHex, optionShapeError, duplicateOptionMessage } from "./option-rules";

describe("parseHex", () => {
  it("accepts empty as null", () => {
    expect(parseHex("")).toEqual({ ok: true, hex: null });
    expect(parseHex("   ")).toEqual({ ok: true, hex: null });
  });
  it("accepts and lowercases #rrggbb", () => {
    expect(parseHex("#A3759F")).toEqual({ ok: true, hex: "#a3759f" });
    expect(parseHex(" #1a2b3c ")).toEqual({ ok: true, hex: "#1a2b3c" });
  });
  it("rejects malformed hex", () => {
    expect(parseHex("a3759f").ok).toBe(false); // no #
    expect(parseHex("#abc").ok).toBe(false); // 3 digits
    expect(parseHex("#1a2b3g").ok).toBe(false); // bad char
    expect(parseHex("red").ok).toBe(false);
  });
});

describe("optionShapeError (ADR 0018 two-way form)", () => {
  it("colour option requires a palette colour", () => {
    expect(optionShapeError("color", { supplierColorId: null, hasImage: false })).toMatch(/glaze colour/i);
    expect(optionShapeError("color", { supplierColorId: null, hasImage: true })).toMatch(/glaze colour/i);
  });
  it("colour option passes with a palette colour", () => {
    expect(optionShapeError("color", { supplierColorId: "id", hasImage: false })).toBeNull();
  });
  it("image option requires an image", () => {
    expect(optionShapeError("image", { supplierColorId: null, hasImage: false })).toMatch(/image/i);
  });
  it("image option passes with an image", () => {
    expect(optionShapeError("image", { supplierColorId: null, hasImage: true })).toBeNull();
  });
});

describe("duplicateOptionMessage", () => {
  it("distinguishes supplier-colour vs hex vs name unique violations", () => {
    expect(duplicateOptionMessage('… "options_category_supplier_color_uniq"')).toMatch(/glaze colour/i);
    expect(duplicateOptionMessage('… constraint "options_category_hex_uniq"')).toMatch(/hex/i);
    expect(duplicateOptionMessage('… constraint "options_category_name_uniq"')).toMatch(/name/i);
    expect(duplicateOptionMessage("something else")).toMatch(/duplicate/i);
  });
});
