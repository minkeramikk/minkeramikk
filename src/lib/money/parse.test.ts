import { describe, it, expect } from "vitest";
import { parsePriceToCents } from "./parse";

describe("parsePriceToCents", () => {
  it("parses plain integers (kr → cents)", () => {
    expect(parsePriceToCents("1500")).toBe(150000);
    expect(parsePriceToCents("0")).toBe(0);
    expect(parsePriceToCents("7")).toBe(700);
  });

  it("ignores thousands separators (space / NBSP / narrow NBSP)", () => {
    expect(parsePriceToCents("1 500")).toBe(150000);
    expect(parsePriceToCents("1 500")).toBe(150000); // NBSP
    expect(parsePriceToCents("1 500 000")).toBe(150000000); // narrow NBSP
    expect(parsePriceToCents("  1500  ")).toBe(150000);
  });

  it("handles a decimal part with comma or dot, padding øre", () => {
    expect(parsePriceToCents("1500,50")).toBe(150050);
    expect(parsePriceToCents("1500.50")).toBe(150050);
    expect(parsePriceToCents("1500,5")).toBe(150050); // "5" → 50 øre
    expect(parsePriceToCents("0,99")).toBe(99);
    expect(parsePriceToCents("19,99")).toBe(1999); // not 1998 (no float)
  });

  it("combines spaces + decimals", () => {
    expect(parsePriceToCents("1 234,56")).toBe(123456);
  });

  it("rejects invalid input with null", () => {
    expect(parsePriceToCents("")).toBeNull();
    expect(parsePriceToCents("   ")).toBeNull();
    expect(parsePriceToCents("abc")).toBeNull();
    expect(parsePriceToCents("12a")).toBeNull();
    expect(parsePriceToCents("-5")).toBeNull(); // no negatives
    expect(parsePriceToCents("1500,555")).toBeNull(); // > 2 decimals
    expect(parsePriceToCents("1.500,50")).toBeNull(); // mixed separators
    expect(parsePriceToCents("1,2,3")).toBeNull();
    expect(parsePriceToCents("1e3")).toBeNull(); // no exponent
    expect(parsePriceToCents("$1500")).toBeNull();
  });
});
