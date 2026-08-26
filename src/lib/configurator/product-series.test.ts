import { describe, expect, it } from "vitest";
import { groupBySeries } from "./product-series";

const p = (id: string, no: string | null, en: string | null) => ({
  id,
  seriesNo: no,
  seriesEn: en,
});

describe("groupBySeries", () => {
  it("keeps sections in first-appearance order (products come sorted by sort_order)", () => {
    const out = groupBySeries(
      [p("1", "Sett", "Sets"), p("2", "Tallerkener", "Plates"), p("3", "Sett", "Sets")],
      "no"
    );
    expect(out.map((s) => s.label)).toEqual(["Sett", "Tallerkener"]);
    expect(out[0].items.map((i) => i.id)).toEqual(["1", "3"]);
  });

  it("uses the locale label", () => {
    expect(groupBySeries([p("1", "Sett", "Sets")], "en")[0].label).toBe("Sets");
  });

  it("groups by the NO value even when the EN label is missing", () => {
    const out = groupBySeries([p("1", "Sett", null), p("2", "Sett", "Sets")], "en");
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Sets");
  });

  it("puts ungrouped products in a trailing unlabelled section", () => {
    const out = groupBySeries([p("1", null, null), p("2", "Sett", "Sets")], "no");
    expect(out.map((s) => s.label)).toEqual(["Sett", null]);
    expect(out[1].items.map((i) => i.id)).toEqual(["1"]);
  });

  it("treats blank strings as ungrouped", () => {
    expect(groupBySeries([p("1", "  ", null)], "no")[0].label).toBeNull();
  });

  it("returns one unlabelled section when nobody filled the series in (degrade)", () => {
    const out = groupBySeries([p("1", null, null), p("2", null, null)], "no");
    expect(out).toHaveLength(1);
    expect(out[0].label).toBeNull();
    expect(out[0].items).toHaveLength(2);
  });
});
