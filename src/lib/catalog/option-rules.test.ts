import { describe, it, expect } from "vitest";
import { parseHex, optionAssetError, duplicateOptionMessage } from "./option-rules";

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

describe("optionAssetError (ADR 0012 image-or-hex)", () => {
  it("requires at least a hex or an image", () => {
    expect(optionAssetError(null, false)).toMatch(/hex colour or a swatch/i);
  });
  it("passes with a hex only", () => {
    expect(optionAssetError("#a3759f", false)).toBeNull();
  });
  it("passes with an image only", () => {
    expect(optionAssetError(null, true)).toBeNull();
  });
  it("passes with both", () => {
    expect(optionAssetError("#a3759f", true)).toBeNull();
  });
});

describe("duplicateOptionMessage", () => {
  it("distinguishes hex vs name unique violations", () => {
    expect(duplicateOptionMessage('… constraint "options_category_hex_uniq"')).toMatch(/hex/i);
    expect(duplicateOptionMessage('… constraint "options_category_name_uniq"')).toMatch(/name/i);
    expect(duplicateOptionMessage("something else")).toMatch(/duplicate/i);
  });
});
