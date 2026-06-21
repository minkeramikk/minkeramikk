import { describe, it, expect } from "vitest";
import { cleanCustomNote, MAX_CUSTOM_NOTE, orderPayloadSchema } from "./schema";

describe("cleanCustomNote", () => {
  it("trims surrounding whitespace", () => {
    expect(cleanCustomNote("  hei  ")).toBe("hei");
  });

  it("strips control characters but keeps newlines", () => {
    expect(cleanCustomNote("a\x00b\x07c\td")).toBe("abcd");
    expect(cleanCustomNote("line1\nline2")).toBe("line1\nline2");
  });

  it("leaves angle brackets intact (escaping is the sink's job, not here)", () => {
    expect(cleanCustomNote("<script>x</script>")).toBe("<script>x</script>");
  });
});

function payload(customNote: unknown) {
  return {
    customerName: "Kari",
    email: "kari@example.no",
    locale: "no",
    turnstileToken: "t",
    items: [
      {
        supplierId: "11111111-1111-4111-8111-111111111111",
        supplierName: "Vietri",
        productId: null,
        productName: "Flat",
        unitPriceCents: 50000,
        currency: "NOK",
        quantity: 1,
        configCode: "MK-D-A",
        configSnapshot: { designSlug: "d", designName: "D", selections: [], customNote },
      },
    ],
  };
}

describe("orderPayloadSchema — customNote sanitisation (AC7)", () => {
  it("sanitises a dirty note in place", () => {
    const parsed = orderPayloadSchema.parse(payload("  brown\x00 dog  "));
    expect((parsed.items[0].configSnapshot as { customNote?: string }).customNote).toBe("brown dog");
  });

  it("rejects a note longer than the max (gentle 400, no crash)", () => {
    const result = orderPayloadSchema.safeParse(payload("x".repeat(MAX_CUSTOM_NOTE + 1)));
    expect(result.success).toBe(false);
  });

  it("accepts a snapshot without a customNote (back-compatible)", () => {
    const result = orderPayloadSchema.safeParse({
      ...payload(undefined),
      items: [
        {
          supplierId: "11111111-1111-4111-8111-111111111111",
          supplierName: "Vietri",
          productId: null,
          productName: "Flat",
          unitPriceCents: 50000,
          currency: "NOK",
          quantity: 1,
          configCode: "MK-D-A",
          configSnapshot: { designSlug: "d", designName: "D", selections: [] },
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
