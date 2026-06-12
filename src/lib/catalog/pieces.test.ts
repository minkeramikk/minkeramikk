import { describe, it, expect } from "vitest";
import { piecesSchema, isSet } from "./pieces";
import type { NewCartLine } from "@/lib/cart/cart";

describe("piecesSchema (admin field)", () => {
  it("coerces a numeric string", () => {
    expect(piecesSchema.parse("3")).toBe(3);
    expect(piecesSchema.parse(2)).toBe(2);
  });

  it("defaults to 1 when absent", () => {
    expect(piecesSchema.parse(undefined)).toBe(1);
  });

  it("rejects below 1, above 99, and non-integers", () => {
    expect(piecesSchema.safeParse(0).success).toBe(false);
    expect(piecesSchema.safeParse(-2).success).toBe(false);
    expect(piecesSchema.safeParse(100).success).toBe(false);
    expect(piecesSchema.safeParse(2.5).success).toBe(false);
  });

  it("accepts the boundaries", () => {
    expect(piecesSchema.parse(1)).toBe(1);
    expect(piecesSchema.parse(99)).toBe(99);
  });
});

describe("isSet — pieces → badge decision", () => {
  it("true only for a genuine count > 1", () => {
    expect(isSet(2)).toBe(true);
    expect(isSet(99)).toBe(true);
  });

  it("false for single items", () => {
    expect(isSet(1)).toBe(false);
    expect(isSet(0)).toBe(false);
  });

  it("false (no crash) for legacy/undefined/NaN — retro-compat", () => {
    expect(isSet(undefined)).toBe(false);
    expect(isSet(null)).toBe(false);
    expect(isSet(NaN)).toBe(false);
  });

  it("a CartLine saved before F29 (no pieces) is not a set", () => {
    const legacy: Partial<NewCartLine> = {
      productId: "p-old",
      configCode: "MK-A",
    };
    expect(isSet(legacy.pieces)).toBe(false);
  });
});
