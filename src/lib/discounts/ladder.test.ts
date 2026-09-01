import { describe, it, expect } from "vitest";
import { ladderFor } from "./ladder";

/** The scale actually live on PROD (5 steps) — the one every customer reads. */
const PROD = [
  { minQty: 4, pct: 5 },
  { minQty: 6, pct: 8 },
  { minQty: 8, pct: 10 },
  { minQty: 10, pct: 15 },
  { minQty: 12, pct: 20 },
];

describe("ladderFor — tier → state, every combination (§C)", () => {
  it("no scale at all, or steps that pay nothing → no ladder, no empty frame", () => {
    expect(ladderFor(4, [])).toBeNull();
    expect(ladderFor(4, [{ minQty: 4, pct: 0 }])).toBeNull();
    expect(ladderFor(4, [{ minQty: 1, pct: 5 }])).toBeNull(); // below the DB CHECK
  });

  it("below the first step: nothing earned, the first one is 'next'", () => {
    const l = ladderFor(2, PROD)!;
    expect(l.pct).toBe(0);
    expect(l.best).toBe(false);
    expect(l.next).toEqual({ minQty: 4, pct: 5 });
    expect(l.steps.map((s) => s.state)).toEqual([
      "next", "future", "future", "future", "future",
    ]);
  });

  it("within reach: what is earned is 'reached', the one ahead is 'next'", () => {
    const l = ladderFor(7, PROD)!;
    expect(l.pct).toBe(8);
    expect(l.steps.map((s) => s.state)).toEqual([
      "reached", "reached", "next", "future", "future",
    ]);
  });

  it("applied EXACTLY on a step: that marker is the current one, and only it", () => {
    const l = ladderFor(6, PROD)!;
    expect(l.steps.filter((s) => s.current).map((s) => s.minQty)).toEqual([6]);
    expect(l.pct).toBe(8);
  });

  it("past the last step: best discount reached, nothing further promised", () => {
    const l = ladderFor(20, PROD)!;
    expect(l.best).toBe(true);
    expect(l.next).toBeNull();
    expect(l.fill).toBe(100);
    expect(l.pct).toBe(20);
  });

  it("exactly ON the last step is already the best", () => {
    expect(ladderFor(12, PROD)!.best).toBe(true);
    expect(ladderFor(12, PROD)!.next).toBeNull();
  });

  it("ordinal positions: half a step of margin at each end, nothing clipped", () => {
    expect(ladderFor(1, PROD)!.steps.map((s) => s.position)).toEqual([10, 30, 50, 70, 90]);
  });

  it("a single step sits in the middle — no division by zero", () => {
    expect(ladderFor(1, [{ minQty: 4, pct: 5 }])!.steps[0].position).toBe(50);
  });

  it("the fill interpolates between markers on the REAL quantities", () => {
    expect(ladderFor(4, PROD)!.fill).toBe(10); // exactly on the first marker
    expect(ladderFor(5, PROD)!.fill).toBe(20); // halfway between 4 (10%) and 6 (30%)
    expect(ladderFor(2, PROD)!.fill).toBe(5); // 2 of the 4 that lead to the first
    expect(ladderFor(0, PROD)!.fill).toBe(0);
  });

  it("many steps (7+): still one marker each, still ordinal", () => {
    const many = [...PROD, { minQty: 16, pct: 22 }, { minQty: 24, pct: 25 }];
    const l = ladderFor(5, many)!;
    expect(l.steps).toHaveLength(7);
    expect(l.steps[0].position).toBeCloseTo(100 / 14, 5);
  });

  it("reads the scale in ascending order however the table is written", () => {
    const messy = [{ minQty: 8, pct: 10 }, { minQty: 2, pct: 3 }, { minQty: 4, pct: 5 }];
    expect(ladderFor(5, messy)!.steps.map((s) => s.minQty)).toEqual([2, 4, 8]);
  });
});
