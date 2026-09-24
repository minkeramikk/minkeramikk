import { describe, it, expect } from "vitest";
import {
  TEXT_POSITIONS,
  POSITION_BITS,
  positionFromFlags,
  flagsForPosition,
  allowedPositions,
  clampPosition,
  isTextPosition,
} from "./text-position";

describe("text-position — constants", () => {
  it("TEXT_POSITIONS lists all four positions, chip order", () => {
    expect(TEXT_POSITIONS).toEqual(["centre", "top", "bottom", "back"]);
  });

  it("POSITION_BITS covers bits 2-3 exactly (0, 4, 8, 12)", () => {
    expect(POSITION_BITS).toEqual({ centre: 0, top: 4, bottom: 8, back: 12 });
  });
});

describe("flagsForPosition / positionFromFlags — round-trip", () => {
  it.each(TEXT_POSITIONS)("round-trips %s through the reserved bits", (pos) => {
    const flags = flagsForPosition(pos);
    expect(positionFromFlags(flags)).toBe(pos);
  });

  it("ignores bits outside the reserved mask (e.g. FLAG_TEXT/FLAG_NOTE_HASH bits set)", () => {
    // bit0 + bit1 (FLAG_TEXT|FLAG_NOTE_HASH = 3) mixed with the top bits (4)
    expect(positionFromFlags(4 | 3)).toBe("top");
  });

  it("bit 0 (today's codes, no position bits set) → centre", () => {
    expect(positionFromFlags(0)).toBe("centre");
    expect(positionFromFlags(1)).toBe("centre"); // FLAG_TEXT only, no position bits
  });
});

describe("allowedPositions", () => {
  it("centre and back are always allowed, top/bottom only when offered", () => {
    expect(allowedPositions([])).toEqual(["centre", "back"]);
  });

  it("adds top/bottom in top,bottom order regardless of input order", () => {
    expect(allowedPositions(["bottom", "top"])).toEqual(["centre", "top", "bottom", "back"]);
  });

  it("ignores unknown extras", () => {
    expect(allowedPositions(["left", "top"])).toEqual(["centre", "top", "back"]);
  });
});

describe("clampPosition", () => {
  it("keeps the position when it's allowed", () => {
    expect(clampPosition("top", ["centre", "top", "back"])).toBe("top");
  });

  it("falls back to centre when not allowed", () => {
    expect(clampPosition("top", ["centre", "back"])).toBe("centre");
  });
});

describe("isTextPosition", () => {
  it("accepts the four known values", () => {
    for (const pos of TEXT_POSITIONS) expect(isTextPosition(pos)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isTextPosition("left")).toBe(false);
    expect(isTextPosition(undefined)).toBe(false);
    expect(isTextPosition(null)).toBe(false);
    expect(isTextPosition(4)).toBe(false);
  });
});
