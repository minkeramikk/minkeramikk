import { describe, it, expect } from "vitest";
import {
  ATTRIBUTE_REGISTRY,
  KNOWN_KEYS,
  attributeLabel,
  formatAttributeValue,
  teaserAttributes,
  hasDetails,
  parseTypedAttributesField,
  buildTypedAttributeRows,
  mapTypedAttributes,
  type TypedAttribute,
} from "./product-attributes";

const weight = (g: number): TypedAttribute => ({ key: "weight", labelNo: null, labelEn: null, valueNum: g, value: null });
const diameter = (mm: number): TypedAttribute => ({ key: "diameter", labelNo: null, labelEn: null, valueNum: mm, value: null });
const dims = (t: string): TypedAttribute => ({ key: "dimensions", labelNo: null, labelEn: null, valueNum: null, value: t });
const custom = (no: string, en: string, v: string): TypedAttribute => ({ key: "custom", labelNo: no, labelEn: en, valueNum: null, value: v });

describe("registry", () => {
  it("covers all known keys with a kind and an icon", () => {
    for (const k of KNOWN_KEYS) {
      expect(ATTRIBUTE_REGISTRY[k]).toBeTruthy();
      expect(["num", "text"]).toContain(ATTRIBUTE_REGISTRY[k].kind);
    }
    expect(ATTRIBUTE_REGISTRY.weight.kind).toBe("num");
    expect(ATTRIBUTE_REGISTRY.dimensions.kind).toBe("text");
  });
});

describe("attributeLabel", () => {
  it("uses the registry for known keys", () => {
    expect(attributeLabel(weight(0), "no")).toBe("Vekt");
    expect(attributeLabel(weight(0), "en")).toBe("Weight");
    expect(attributeLabel(diameter(0), "no")).toBe("Diameter");
    expect(attributeLabel(dims(""), "no")).toBe("Mål");
    expect(attributeLabel(dims(""), "en")).toBe("Dimensions");
  });
  it("uses the per-product label for custom", () => {
    expect(attributeLabel(custom("Farge", "Colour", "Blå"), "no")).toBe("Farge");
    expect(attributeLabel(custom("Farge", "Colour", "Blå"), "en")).toBe("Colour");
  });
});

describe("formatAttributeValue", () => {
  it("weight grams → kg, locale decimal", () => {
    expect(formatAttributeValue(weight(400), "no")).toBe("0,4 kg");
    expect(formatAttributeValue(weight(400), "en")).toBe("0.4 kg");
    expect(formatAttributeValue(weight(1200), "no")).toBe("1,2 kg");
  });
  it("diameter mm → Ø cm", () => {
    expect(formatAttributeValue(diameter(220), "no")).toBe("Ø 22 cm");
    expect(formatAttributeValue(diameter(185), "en")).toBe("Ø 18.5 cm");
  });
  it("dimensions / custom return the text as-is", () => {
    expect(formatAttributeValue(dims("20 × 20 cm"), "no")).toBe("20 × 20 cm");
    expect(formatAttributeValue(custom("Farge", "Colour", "Blå"), "en")).toBe("Blå");
  });
});

describe("teaserAttributes", () => {
  it("prefers diameter then weight, capped at 2", () => {
    const attrs = [custom("A", "A", "x"), weight(400), diameter(220)];
    const t = teaserAttributes(attrs);
    expect(t.map((a) => a.key)).toEqual(["diameter", "weight"]);
  });
  it("returns [] when no priority specs present", () => {
    expect(teaserAttributes([dims("x"), custom("A", "A", "y")])).toEqual([]);
  });
});

describe("hasDetails", () => {
  it("true with a description or any attribute", () => {
    expect(hasDetails("hi", [])).toBe(true);
    expect(hasDetails(null, [weight(1)])).toBe(true);
  });
  it("false when both empty", () => {
    expect(hasDetails("  ", [])).toBe(false);
    expect(hasDetails(null, [])).toBe(false);
  });
});

describe("parseTypedAttributesField", () => {
  it("[] for empty/absent", () => {
    expect(parseTypedAttributesField(null)).toEqual([]);
    expect(parseTypedAttributesField("")).toEqual([]);
  });
  it("parses a numeric known type (label nulled, value nulled)", () => {
    const raw = JSON.stringify([{ key: "weight", valueNum: 400 }]);
    expect(parseTypedAttributesField(raw)).toEqual([
      { key: "weight", labelNo: null, labelEn: null, valueNum: 400, value: null },
    ]);
  });
  it("parses a text known type (dimensions)", () => {
    const raw = JSON.stringify([{ key: "dimensions", value: "20 × 20 cm" }]);
    expect(parseTypedAttributesField(raw)).toEqual([
      { key: "dimensions", labelNo: null, labelEn: null, valueNum: null, value: "20 × 20 cm" },
    ]);
  });
  it("parses a custom type with its labels", () => {
    const raw = JSON.stringify([{ key: "custom", labelNo: "Farge", labelEn: "Colour", value: "Blå" }]);
    expect(parseTypedAttributesField(raw)).toEqual([
      { key: "custom", labelNo: "Farge", labelEn: "Colour", valueNum: null, value: "Blå" },
    ]);
  });
  it("rejects: unknown key, missing numeric value, negative/float, empty text, custom without labels", () => {
    expect(parseTypedAttributesField(JSON.stringify([{ key: "color", value: "x" }]))).toBeNull();
    expect(parseTypedAttributesField(JSON.stringify([{ key: "weight" }]))).toBeNull();
    expect(parseTypedAttributesField(JSON.stringify([{ key: "weight", valueNum: -5 }]))).toBeNull();
    expect(parseTypedAttributesField(JSON.stringify([{ key: "weight", valueNum: 1.5 }]))).toBeNull();
    expect(parseTypedAttributesField(JSON.stringify([{ key: "dimensions", value: "" }]))).toBeNull();
    expect(parseTypedAttributesField(JSON.stringify([{ key: "custom", labelNo: "", labelEn: "", value: "x" }]))).toBeNull();
    expect(parseTypedAttributesField("{not json")).toBeNull();
  });
});

describe("buildTypedAttributeRows", () => {
  it("assigns sort_order by index and maps to snake_case columns", () => {
    expect(buildTypedAttributeRows("p1", [diameter(220), custom("Farge", "Colour", "Blå")])).toEqual([
      { product_id: "p1", key: "diameter", label_no: null, label_en: null, value: null, value_num: 220, sort_order: 0 },
      { product_id: "p1", key: "custom", label_no: "Farge", label_en: "Colour", value: "Blå", value_num: null, sort_order: 1 },
    ]);
  });
});

describe("mapTypedAttributes", () => {
  it("orders by sort_order and falls back unknown keys to custom", () => {
    expect(
      mapTypedAttributes([
        { key: "weight", label_no: null, label_en: null, value: null, value_num: 400, sort_order: 1 },
        { key: "zzz", label_no: "X", label_en: "X", value: "v", value_num: null, sort_order: 0 },
      ])
    ).toEqual([
      { key: "custom", labelNo: "X", labelEn: "X", valueNum: null, value: "v" },
      { key: "weight", labelNo: null, labelEn: null, valueNum: 400, value: null },
    ]);
  });
  it("[] for null", () => {
    expect(mapTypedAttributes(null)).toEqual([]);
  });
});
