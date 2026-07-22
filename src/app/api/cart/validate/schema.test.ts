import { describe, expect, it } from "vitest";
import { validateRequestSchema } from "./schema";

describe("validateRequestSchema", () => {
  it("accepts a well-formed body", () => {
    const parsed = validateRequestSchema.safeParse({
      entries: [{ configCode: "MK-A-B", productSlug: "vietri-set", quantity: 2 }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects malformed codes, slugs and quantities", () => {
    const bad = [
      { configCode: "mk a b!", productSlug: "vietri-set", quantity: 1 },
      { configCode: "MK-A-B", productSlug: "Vietri Set", quantity: 1 },
      { configCode: "MK-A-B", productSlug: "vietri-set", quantity: 0 },
      { configCode: "MK-A-B", productSlug: "vietri-set", quantity: 1000 },
    ];
    for (const entry of bad) {
      expect(validateRequestSchema.safeParse({ entries: [entry] }).success).toBe(false);
    }
  });

  it("rejects an empty list and a list over the cap", () => {
    expect(validateRequestSchema.safeParse({ entries: [] }).success).toBe(false);
    const many = Array.from({ length: 51 }, () => ({
      configCode: "MK-A-B",
      productSlug: "vietri-set",
      quantity: 1,
    }));
    expect(validateRequestSchema.safeParse({ entries: many }).success).toBe(false);
  });

  it("rejects extra fields, so a note can never reach the server by accident", () => {
    const parsed = validateRequestSchema.safeParse({
      entries: [
        { configCode: "MK-A-B", productSlug: "vietri-set", quantity: 1, customNote: "secret" },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
