import { describe, it, expect } from "vitest";
import {
  decodeKitParam,
  designSegmentOf,
  encodeKitParam,
} from "./kit-code";

describe("kit codec", () => {
  it("aggregates qty per slug across painted and unpainted lines", () => {
    const out = encodeKitParam("G", [
      { productSlug: "deep-plate", quantity: 2 },
      { productSlug: "deep-plate", quantity: 3 },
      { productSlug: "coffee-cup", quantity: 4 },
    ]);
    expect(out).toBe("G~deep-plate.5~coffee-cup.4");
  });

  it("drops lines without a valid slug", () => {
    const out = encodeKitParam("G", [
      { quantity: 2 },
      { productSlug: "BAD SLUG", quantity: 1 },
      { productSlug: "mug", quantity: 1 },
    ]);
    expect(out).toBe("G~mug.1");
  });

  it("returns empty string with no shareable rows or bad design code", () => {
    expect(encodeKitParam("G", [{ quantity: 2 }])).toBe("");
    expect(encodeKitParam("", [{ productSlug: "mug", quantity: 1 }])).toBe("");
    expect(encodeKitParam("G.S", [{ productSlug: "mug", quantity: 1 }])).toBe("");
  });

  it("decodes a well-formed param", () => {
    expect(decodeKitParam("G~deep-plate.6~coffee-cup.4")).toEqual({
      designCode: "G",
      entries: [
        { productSlug: "deep-plate", qty: 6 },
        { productSlug: "coffee-cup", qty: 4 },
      ],
      dropped: 0,
    });
  });

  it("drops malformed rows and clamps qty", () => {
    const { entries, dropped } = decodeKitParam("G~x~mug.500");
    expect(entries).toEqual([{ productSlug: "mug", qty: 99 }]);
    expect(dropped).toBe(1);
  });

  it("caps rows at the set limit and rejects non-kit heads", () => {
    const rows = Array.from({ length: 51 }, (_, i) => `p-${i}.1`).join("~");
    const { entries, dropped } = decodeKitParam(`G~${rows}`);
    expect(entries).toHaveLength(50);
    expect(dropped).toBe(1);
    expect(decodeKitParam("MK-G-S.mug.2")).toEqual({
      designCode: "",
      entries: [],
      dropped: 0,
    });
    expect(decodeKitParam("")).toEqual({ designCode: "", entries: [], dropped: 0 });
  });

  it("designSegmentOf reads the first segment after MK-", () => {
    expect(designSegmentOf("MK-G-S-A-A")).toBe("G");
    expect(designSegmentOf("G-S")).toBe("G");
    expect(designSegmentOf("")).toBeNull();
  });
});
