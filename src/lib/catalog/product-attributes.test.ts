import { describe, it, expect } from "vitest";
import {
  attributesSchema,
  parseAttributesField,
  buildAttributeRows,
  mapAttributes,
  hasProductInfo,
  ATTR_VALUE_MAX,
} from "./product-attributes";

describe("attributesSchema", () => {
  it("accepts valid rows and trims", () => {
    const r = attributesSchema.parse([
      { labelNo: " Vekt ", labelEn: " Weight ", value: " 1,2 kg " },
    ]);
    expect(r).toEqual([{ labelNo: "Vekt", labelEn: "Weight", value: "1,2 kg" }]);
  });

  it("rejects an empty label or value", () => {
    expect(() =>
      attributesSchema.parse([{ labelNo: "", labelEn: "W", value: "x" }])
    ).toThrow();
    expect(() =>
      attributesSchema.parse([{ labelNo: "V", labelEn: "W", value: "  " }])
    ).toThrow();
  });

  it("rejects a value longer than the cap", () => {
    expect(() =>
      attributesSchema.parse([
        { labelNo: "V", labelEn: "W", value: "x".repeat(ATTR_VALUE_MAX + 1) },
      ])
    ).toThrow();
  });
});

describe("parseAttributesField", () => {
  it("parses a valid JSON array", () => {
    const raw = JSON.stringify([{ labelNo: "Vekt", labelEn: "Weight", value: "1 kg" }]);
    expect(parseAttributesField(raw)).toEqual([
      { labelNo: "Vekt", labelEn: "Weight", value: "1 kg" },
    ]);
  });

  it("returns [] for an absent/empty field", () => {
    expect(parseAttributesField(null)).toEqual([]);
    expect(parseAttributesField("")).toEqual([]);
  });

  it("returns null for malformed JSON or invalid rows", () => {
    expect(parseAttributesField("{not json")).toBeNull();
    expect(parseAttributesField(JSON.stringify([{ labelNo: "", labelEn: "", value: "" }]))).toBeNull();
  });
});

describe("buildAttributeRows", () => {
  it("assigns sort_order by index", () => {
    const rows = buildAttributeRows("p1", [
      { labelNo: "Vekt", labelEn: "Weight", value: "1 kg" },
      { labelNo: "Mål", labelEn: "Size", value: "20 cm" },
    ]);
    expect(rows).toEqual([
      { product_id: "p1", label_no: "Vekt", label_en: "Weight", value: "1 kg", sort_order: 0 },
      { product_id: "p1", label_no: "Mål", label_en: "Size", value: "20 cm", sort_order: 1 },
    ]);
  });
});

describe("mapAttributes", () => {
  it("orders by sort_order and maps to camelCase", () => {
    expect(
      mapAttributes([
        { label_no: "B", label_en: "B", value: "2", sort_order: 1 },
        { label_no: "A", label_en: "A", value: "1", sort_order: 0 },
      ])
    ).toEqual([
      { labelNo: "A", labelEn: "A", value: "1" },
      { labelNo: "B", labelEn: "B", value: "2" },
    ]);
  });

  it("returns [] for null", () => {
    expect(mapAttributes(null)).toEqual([]);
  });
});

describe("hasProductInfo", () => {
  it("true when a description is present", () => {
    expect(hasProductInfo("hi", [])).toBe(true);
  });
  it("true when there is at least one attribute", () => {
    expect(hasProductInfo(null, [{ labelNo: "V", labelEn: "W", value: "1" }])).toBe(true);
  });
  it("false when both are empty", () => {
    expect(hasProductInfo("   ", [])).toBe(false);
    expect(hasProductInfo(null, [])).toBe(false);
  });
});
