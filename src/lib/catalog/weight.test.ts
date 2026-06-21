import { describe, it, expect } from "vitest";
import { parseWeightG } from "./weight";

describe("parseWeightG", () => {
  it("returns null for an empty/absent field (clears the column)", () => {
    expect(parseWeightG(null)).toBeNull();
    expect(parseWeightG("")).toBeNull();
    expect(parseWeightG("   ")).toBeNull();
  });
  it("parses a non-negative integer in grams", () => {
    expect(parseWeightG("1200")).toBe(1200);
    expect(parseWeightG("0")).toBe(0);
  });
  it("returns undefined for invalid input", () => {
    expect(parseWeightG("-5")).toBeUndefined();
    expect(parseWeightG("1.5")).toBeUndefined();
    expect(parseWeightG("abc")).toBeUndefined();
  });
});
