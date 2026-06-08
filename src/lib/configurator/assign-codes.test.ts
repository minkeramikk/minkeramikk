import { describe, it, expect } from "vitest";
import { nextCode } from "./assign-codes";
import { CODE_ALPHABET } from "./config-code";

describe("nextCode (ADR 0011 stable code assignment)", () => {
  it("returns the first free single char for an empty scope", () => {
    expect(nextCode(new Set())).toBe(CODE_ALPHABET[0]);
  });

  it("skips codes already used in the scope", () => {
    const used = new Set([CODE_ALPHABET[0], CODE_ALPHABET[1]]);
    expect(nextCode(used)).toBe(CODE_ALPHABET[2]);
  });

  it("only ever emits safe-alphabet characters (no 0/O/1/I/L)", () => {
    const c = nextCode(new Set());
    expect(CODE_ALPHABET.includes(c)).toBe(true);
    expect(c).not.toMatch(/[0O1IL]/);
  });

  it("falls back to a 2-char code once all single chars are taken", () => {
    const allSingles = new Set(CODE_ALPHABET.split(""));
    const code = nextCode(allSingles);
    expect(code.length).toBe(2);
    expect(allSingles.has(code)).toBe(false);
  });

  it("is deterministic for the same used-set", () => {
    const used = new Set([CODE_ALPHABET[0]]);
    expect(nextCode(used)).toBe(nextCode(new Set([CODE_ALPHABET[0]])));
  });
});
