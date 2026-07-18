import { describe, it, expect } from "vitest";
import { moveItem } from "./reorder";

describe("moveItem", () => {
  it("moves an item down", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });
  it("moves an item up", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
  it("is a no-op when from === to", () => {
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });
  it("clamps an out-of-range target instead of dropping the item", () => {
    expect(moveItem(["a", "b", "c"], 0, 9)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, -3)).toEqual(["c", "a", "b"]);
  });
  it("clamps a negative target to the front rather than counting from the end", () => {
    expect(moveItem(["a", "b", "c", "d"], 3, -1)).toEqual(["d", "a", "b", "c"]);
  });

  it("returns a fresh array even when `from` is out of range", () => {
    const src = ["a", "b", "c"];
    const out = moveItem(src, 10, 1);
    expect(out).toEqual(["a", "b", "c"]);
    expect(out).not.toBe(src);
  });

  it("does not mutate the input", () => {
    const src = ["a", "b", "c"];
    moveItem(src, 0, 2);
    expect(src).toEqual(["a", "b", "c"]);
  });
});
