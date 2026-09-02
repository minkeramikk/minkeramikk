import { describe, it, expect } from "vitest";
import { cleanCustomNote, cleanCustomText, MAX_CUSTOM_NOTE, MAX_CUSTOM_TEXT, orderPayloadSchema } from "./schema";

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

describe("orderPayloadSchema — quantity/unitPriceCents bounds (M5, fix wave)", () => {
  it("rejects an absurd quantity with a gentle 400, not a crash downstream in multiply()", () => {
    const p = payload(undefined);
    p.items[0].quantity = 1_000_000;
    const result = orderPayloadSchema.safeParse(p);
    expect(result.success).toBe(false);
  });

  it("rejects an absurd unitPriceCents the same way", () => {
    const p = payload(undefined);
    p.items[0].unitPriceCents = Number.MAX_SAFE_INTEGER;
    const result = orderPayloadSchema.safeParse(p);
    expect(result.success).toBe(false);
  });

  it("still accepts an ordinary quantity/price", () => {
    const result = orderPayloadSchema.safeParse(payload(undefined));
    expect(result.success).toBe(true);
  });
});

describe("cleanCustomText (untrusted read path — TL mandate 1+2)", () => {
  it("trims, strips control chars, and truncates to the cap", () => {
    const forged = "\x00\x07" + "x".repeat(500);
    const out = cleanCustomText(forged);
    expect(out.length).toBe(MAX_CUSTOM_TEXT);
    expect(out).toBe("x".repeat(MAX_CUSTOM_TEXT));
  });
  it("collapses a whitespace-only value to empty", () => {
    expect(cleanCustomText("   \t  ")).toBe("");
  });
  it("keeps æøå/accents intact", () => {
    expect(cleanCustomText("  Gratulerer Åse  ")).toBe("Gratulerer Åse");
  });
});

function payloadWithText(customText: unknown) {
  return {
    customerName: "A",
    email: "a@b.no",
    locale: "no" as const,
    turnstileToken: "t",
    items: [
      {
        supplierId: "00000000-0000-0000-0000-000000000000",
        supplierName: "S",
        productId: "11111111-1111-4111-8111-111111111111",
        productName: "P",
        unitPriceCents: 100,
        currency: "NOK" as const,
        quantity: 1,
        configCode: "MK-x",
        configSnapshot: { designSlug: "d", designName: "D", selections: [], customText },
      },
    ],
  };
}

describe("orderPayloadSchema — customText sanitisation (F38 AC3/AC5)", () => {
  it("trims and keeps æøå/accents", () => {
    const parsed = orderPayloadSchema.parse(payloadWithText("  Gratulerer Åse  "));
    expect((parsed.items[0].configSnapshot as { customText?: string }).customText).toBe("Gratulerer Åse");
  });
  it("strips control chars", () => {
    const parsed = orderPayloadSchema.parse(payloadWithText("Hi\x00\x07 there"));
    expect((parsed.items[0].configSnapshot as { customText?: string }).customText).toBe("Hi there");
  });
  it("accepts 24 and 25 chars, rejects 26 (R4-FIX Ⓑ boundary)", () => {
    expect(MAX_CUSTOM_TEXT).toBe(25);
    expect(orderPayloadSchema.safeParse(payloadWithText("x".repeat(24))).success).toBe(true);
    expect(orderPayloadSchema.safeParse(payloadWithText("x".repeat(25))).success).toBe(true);
    expect(orderPayloadSchema.safeParse(payloadWithText("x".repeat(26))).success).toBe(false);
  });
  it("counts spaces against the cap", () => {
    expect(orderPayloadSchema.safeParse(payloadWithText("a b c d e f g h i j k l m")).success).toBe(true);
    expect(orderPayloadSchema.safeParse(payloadWithText("a b c d e f g h i j k l m n")).success).toBe(false);
  });
  it("accepts a snapshot without customText", () => {
    const result = orderPayloadSchema.safeParse(payloadWithText(undefined));
    expect(result.success).toBe(true);
  });
});

describe("orderPayloadSchema — poststed (R4-ORDERS-PLUS voce C)", () => {
  const withCity = (city: unknown) => ({ ...payload("ok"), city });

  it("accepts a city, and trims it", () => {
    const r = orderPayloadSchema.safeParse(withCity("  Oslo  "));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.city).toBe("Oslo");
  });

  it("stays OPTIONAL, like the rest of the address before launch", () => {
    expect(orderPayloadSchema.safeParse(payload("ok")).success).toBe(true);
    expect(orderPayloadSchema.safeParse(withCity("")).success).toBe(true);
  });

  it("refuses an absurd city instead of letting it reach the label", () => {
    expect(orderPayloadSchema.safeParse(withCity("x".repeat(81))).success).toBe(false);
  });
});
