import { describe, it, expect } from "vitest";
import {
  SWITCH_CAP,
  paletteHexes,
  nowSecondLine,
  switchLane,
  capLane,
} from "./palette-card-model";
import type { Palette } from "@/lib/palettes/palettes";

const make = (code: string, slug = "alici", createdAt = 0): Palette => ({
  code, name: `P-${code}`, designSlug: slug,
  snapshot: { designSlug: slug, designName: slug, selections: [] },
  layers: [], createdAt, usedAt: createdAt,
});

describe("palette card model", () => {
  it("nowSecondLine: dedication wins", () => {
    expect(nowSecondLine("Til mamma", "Amalfi")).toEqual({ kind: "dedication", text: "Til mamma" });
  });

  it("nowSecondLine: design name when none or blank", () => {
    expect(nowSecondLine(undefined, "Amalfi")).toEqual({ kind: "design", text: "Amalfi" });
    expect(nowSecondLine("   ", "Amalfi")).toEqual({ kind: "design", text: "Amalfi" });
  });

  it("paletteHexes drops null", () => {
    const sel = (hex: string | null) => ({ label: "l", option: "o", hex });
    expect(paletteHexes({ selections: [sel("#a00"), sel(null), sel("#0a0")] })).toEqual(["#a00", "#0a0"]);
  });

  it("switchLane: 10 saved, one active → 9, current design first, newest-first", () => {
    const list = [
      make("O1", "bahia", 1), make("A1", "alici", 1), make("O2", "bahia", 2),
      make("A2", "alici", 2), make("A3", "alici", 3), make("O3", "bahia", 3),
      make("A4", "alici", 4), make("O4", "bahia", 4), make("A5", "alici", 5),
      make("O5", "bahia", 5),
    ];
    const lane = switchLane(list, "A3", "alici");
    expect(lane.map((p) => p.code)).toEqual(["A5", "A4", "A2", "A1", "O1", "O2", "O3", "O4", "O5"]);
  });

  it("switchLane: 0 saved → []", () => {
    expect(switchLane([], null, "alici")).toEqual([]);
  });

  it("switchLane: draft (no active) excludes nothing", () => {
    expect(switchLane([make("A"), make("B"), make("C")], null, "alici")).toHaveLength(3);
  });

  it("capLane: 9 → 6 visible, 3 hidden; showAll → 9, 0; 6 → 6, 0", () => {
    const nine = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(capLane(nine, false)).toEqual({ visible: nine.slice(0, SWITCH_CAP), hidden: 3 });
    expect(capLane(nine, true)).toEqual({ visible: nine, hidden: 0 });
    expect(capLane(nine.slice(0, 6), false)).toEqual({ visible: nine.slice(0, 6), hidden: 0 });
  });
});
