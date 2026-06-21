import { describe, it, expect } from "vitest";
import { fullRowInsertIndex } from "./grid-rows";

describe("fullRowInsertIndex", () => {
  it("returns the last index of the selected card's row (3 cols)", () => {
    // items 0..6, 3 cols → rows [0,1,2][3,4,5][6]
    expect(fullRowInsertIndex(0, 3, 7)).toBe(2); // row 1 ends at 2
    expect(fullRowInsertIndex(1, 3, 7)).toBe(2);
    expect(fullRowInsertIndex(3, 3, 7)).toBe(5); // row 2 ends at 5
    expect(fullRowInsertIndex(6, 3, 7)).toBe(6); // last partial row ends at 6 (clamped)
  });
  it("works for 2 cols", () => {
    // items 0..4, 2 cols → rows [0,1][2,3][4]
    expect(fullRowInsertIndex(0, 2, 5)).toBe(1);
    expect(fullRowInsertIndex(3, 2, 5)).toBe(3);
    expect(fullRowInsertIndex(4, 2, 5)).toBe(4); // clamped to last index
  });
  it("returns -1 when nothing is selected", () => {
    expect(fullRowInsertIndex(-1, 3, 7)).toBe(-1);
  });
});
