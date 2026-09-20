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
    phone: "99887766",
    address: "Thorvald Meyers gate 5",
    zipcode: "0555",
    city: "Oslo",
    country: "Norge",
    acceptTerms: true,
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

  // Final-review round 2, finding 5b (TL ruling recorded, not shipped until
  // now): 250 → 50. The wish only ever enters the config code as a hash
  // (never its length), but the field itself still reaches the order
  // payload uncapped-in-practice before this — pin the new boundary so it
  // can't silently drift back.
  it("the cap is 50, and exactly 50 is still accepted", () => {
    expect(MAX_CUSTOM_NOTE).toBe(50);
    expect(orderPayloadSchema.safeParse(payload("x".repeat(50))).success).toBe(true);
    expect(orderPayloadSchema.safeParse(payload("x".repeat(51))).success).toBe(false);
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
  it("truncates by code point, not UTF-16 code unit: an emoji at the cap boundary is never split into a dangling surrogate", () => {
    const input = "A".repeat(24) + "😀"; // 24 BMP chars + 1 surrogate-pair emoji = 25 code points
    const out = cleanCustomText(input);
    expect(out).toBe("A".repeat(24) + "😀"); // whole emoji kept, not a lone surrogate
    expect([...out]).toHaveLength(MAX_CUSTOM_TEXT); // 25 code points
    expect(out.codePointAt(out.length - 2)).toBeGreaterThan(0xffff); // the emoji is intact, not split
  });
});

function payloadWithText(customText: unknown) {
  return {
    customerName: "A",
    email: "a@b.no",
    phone: "99887766",
    address: "Thorvald Meyers gate 5",
    zipcode: "0555",
    city: "Oslo",
    country: "Norge",
    acceptTerms: true as const,
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

  // Final-review round 2, finding 4: cleanCustomText truncates by CODE
  // POINT (25 of them, however many UTF-16 units that takes), but this
  // schema's own refine used to count UTF-16 units instead — so a value
  // cleanCustomText itself had already capped at exactly 25 code points of
  // astral characters (50 UTF-16 units) got rejected here as "too long",
  // a checkout that could never complete for no reason visible to the
  // customer.
  it("accepts 25 CODE POINTS of astral (surrogate-pair) characters, not 25 UTF-16 units (R5-TEXT-IDENTITY final review)", () => {
    const twentyFiveEmoji = "😀".repeat(25); // 25 code points, 50 UTF-16 units
    expect(twentyFiveEmoji.length).toBe(50);
    expect(Array.from(twentyFiveEmoji)).toHaveLength(25);
    expect(orderPayloadSchema.safeParse(payloadWithText(twentyFiveEmoji)).success).toBe(
      true
    );
    expect(
      orderPayloadSchema.safeParse(payloadWithText("😀".repeat(26))).success
    ).toBe(false);
  });
});

describe("orderPayloadSchema — poststed (R4-ORDERS-PLUS voce C)", () => {
  const withCity = (city: unknown) => ({ ...payload("ok"), city });

  it("accepts a city, and trims it", () => {
    const r = orderPayloadSchema.safeParse(withCity("  Oslo  "));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.city).toBe("Oslo");
  });

  // Era opzionale "in attesa della regola pre-lancio": la regola è arrivata
  // (Daniele 3/9, tutto obbligatorio tranne le note), quindi un poststed vuoto
  // ora è un 400 — è la metà di un indirizzo norvegese.
  it("is MANDATORY since the pre-launch rule landed", () => {
    expect(orderPayloadSchema.safeParse(withCity("")).success).toBe(false);
    expect(orderPayloadSchema.safeParse(withCity("   ")).success).toBe(false);
    expect(orderPayloadSchema.safeParse(withCity(undefined)).success).toBe(false);
  });

  it("refuses an absurd city instead of letting it reach the label", () => {
    expect(orderPayloadSchema.safeParse(withCity("x".repeat(81))).success).toBe(false);
  });
});
