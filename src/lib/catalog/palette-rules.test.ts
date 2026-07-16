import { describe, it, expect } from "vitest";
import {
  parsePaletteImport,
  duplicatePaletteMessage,
  mergeResolvedRows,
} from "./palette-rules";

describe("parsePaletteImport", () => {
  it("parses '#hex;Name' lines, trimming and lowercasing the hex", () => {
    const r = parsePaletteImport("#0160b2;Havblå\n#FF9048; Oransje ");
    expect(r.rows).toEqual([
      { hex: "#0160b2", name: "Havblå" },
      { hex: "#ff9048", name: "Oransje" },
    ]);
    expect(r.errors).toEqual([]);
  });

  it("collects an error (not a row) for a missing ';', a bad hex, or a missing name", () => {
    const r = parsePaletteImport("no-separator\n#zzz;Bad\n#0160b2;");
    expect(r.rows).toEqual([]);
    expect(r.errors).toHaveLength(3);
  });

  it("skips blank lines", () => {
    const r = parsePaletteImport("\n   \n#0160b2;Blu\n");
    expect(r.rows).toEqual([{ hex: "#0160b2", name: "Blu" }]);
    expect(r.errors).toEqual([]);
  });
});

describe("mergeResolvedRows", () => {
  it("patches id/swatchImage/swatchUrl by key and leaves unmatched rows untouched", () => {
    const rows = [
      { key: "k1", id: undefined as string | undefined, swatchImage: null as string | null, swatchUrl: null as string | null },
      { key: "k2", id: "id2", swatchImage: "old.png", swatchUrl: "u/old" },
    ];
    const out = mergeResolvedRows(rows, [
      { key: "k1", id: "gen-1", swatchImage: "suppliers/s/colors/0160b2-tok.png", swatchUrl: "u/new" },
    ]);
    expect(out[0]).toMatchObject({
      key: "k1",
      id: "gen-1",
      swatchImage: "suppliers/s/colors/0160b2-tok.png",
      swatchUrl: "u/new",
    });
    expect(out[1]).toBe(rows[1]); // unmatched row keeps its reference
    expect(rows[0].id).toBeUndefined(); // input not mutated
  });
});

describe("duplicatePaletteMessage", () => {
  it("distinguishes hex vs name collisions", () => {
    expect(duplicatePaletteMessage("supplier_colors_supplier_id_hex_key")).toMatch(/hex/i);
    expect(duplicatePaletteMessage("supplier_colors_supplier_id_name_key")).toMatch(/name/i);
    expect(duplicatePaletteMessage("something_else")).toMatch(/duplicate|already/i);
  });
});
