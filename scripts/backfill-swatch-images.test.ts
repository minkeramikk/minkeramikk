import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  paletteSwatchByHex,
  swatchPath,
  backfillSwatchImages,
} from "./backfill-swatch-images";

describe("paletteSwatchByHex", () => {
  it("maps hex → swatch url, deduping and keeping the first", () => {
    const m = paletteSwatchByHex({
      collections: {
        palettes: [
          { url: "u/a.png", hex: "#a3759f" },
          { url: "u/b.png", hex: "#5c3930" },
          { url: "u/dup.png", hex: "#a3759f" }, // duplicate hex
        ],
      },
    });
    expect(m.size).toBe(2);
    expect(m.get("#a3759f")).toBe("u/a.png"); // first wins
    expect(m.get("#5c3930")).toBe("u/b.png");
  });

  it("normalizes a doubled leading hash and lowercases", () => {
    const m = paletteSwatchByHex({
      collections: { palettes: [{ url: "u/x.png", hex: "##78A3D4" }] },
    });
    expect(m.get("#78a3d4")).toBe("u/x.png");
  });

  it("skips entries without hex", () => {
    const m = paletteSwatchByHex({
      collections: { palettes: [{ url: "u/x.png", hex: null }] },
    });
    expect(m.size).toBe(0);
  });
});

describe("swatchPath", () => {
  it("derives a deduped, hash-less, lowercased path", () => {
    expect(swatchPath("#A3759F")).toBe("swatches/a3759f.png");
    expect(swatchPath("#5c3930")).toBe("swatches/5c3930.png");
  });
});

// ── fake Supabase client + fetch for backfillSwatchImages ──

function fakeDb(optionHexes: (string | null)[], uploadErr = false) {
  const uploads: string[] = [];
  const updates: { image: string; hex: string }[] = [];
  const db = {
    from(table: string) {
      if (table !== "options") throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return {
            not() {
              return Promise.resolve({
                data: optionHexes.map((hex) => ({ hex })),
                error: null,
              });
            },
          };
        },
        update(obj: { image: string }) {
          return {
            eq(_col: string, hex: string) {
              return {
                select() {
                  updates.push({ image: obj.image, hex });
                  const n = optionHexes.filter((h) => h === hex).length;
                  return Promise.resolve({
                    data: Array.from({ length: n }, (_v, i) => ({ id: `${hex}#${i}` })),
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
    storage: {
      from() {
        return {
          upload(path: string) {
            uploads.push(path);
            return Promise.resolve({
              error: uploadErr ? { message: "boom" } : null,
            });
          },
        };
      },
    },
  };
  return { db: db as unknown as SupabaseClient, uploads, updates };
}

const CATALOG = {
  collections: {
    palettes: [
      { url: "cdn/a.png", hex: "#a3759f" },
      { url: "cdn/b.png", hex: "#5c3930" },
    ],
  },
};

describe("backfillSwatchImages", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
        headers: { get: () => "image/webp" },
      }))
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("uploads one swatch per matched hex and sets options.image", async () => {
    // 4 color options: two #a3759f, one #5c3930, one unmatched #ffffff
    // (stored hexes are always lowercase — parseFilename lowercases them)
    const { db, uploads, updates } = fakeDb([
      "#a3759f",
      "#a3759f",
      "#5c3930",
      "#ffffff",
    ]);
    const r = await backfillSwatchImages(db, CATALOG);

    expect(r.colorOptionsTotal).toBe(4);
    expect(r.swatchesUploaded).toBe(2); // a3759f + 5c3930, deduped
    expect(uploads.sort()).toEqual([
      "swatches/5c3930.png",
      "swatches/a3759f.png",
    ]);
    // options updated = rows matching the two known hexes (3 of 4)
    expect(r.optionsUpdated).toBe(3);
    expect(r.missingSwatch).toEqual(["#ffffff"]);
    expect(updates.map((u) => u.image).sort()).toEqual([
      "swatches/5c3930.png",
      "swatches/a3759f.png",
    ]);
  });

  it("is idempotent: a second run converges to the same counts", async () => {
    const hexes = ["#a3759f", "#5c3930", "#5c3930"];
    const a = await backfillSwatchImages(fakeDb(hexes).db, CATALOG);
    const b = await backfillSwatchImages(fakeDb(hexes).db, CATALOG);
    expect(b).toEqual(a);
    expect(b.swatchesUploaded).toBe(2);
    expect(b.optionsUpdated).toBe(3);
    expect(b.missingSwatch).toEqual([]);
  });

  it("propagates an upload failure", async () => {
    const { db } = fakeDb(["#a3759f"], true);
    await expect(backfillSwatchImages(db, CATALOG)).rejects.toThrow(/upload/);
  });
});
