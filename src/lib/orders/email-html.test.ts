import { describe, it, expect, beforeAll } from "vitest";
import { customerEmail, adminEmail, supplierEmail, type MailItem } from "./email-html";
import { NO_VIPPS, type VippsSettings } from "./vipps";
import type { ThemeTokens } from "@/lib/theme";

const theme: ThemeTokens = { light: "#fbe9e4", dark: "#2b2330", accent: "#7d4f9c" };
const items: MailItem[] = [
  { productName: "Vietri Flat", quantity: 2, unitPriceCents: 50000, currency: "NOK", configCode: "MK-A-K2" },
];

describe("customerEmail", () => {
  const mail = customerEmail({
    name: "Kari",
    code: "MK-1042",
    locale: "no",
    items,
    setUrl: "https://minkeramikk.no/no/configurator?set=MK-A-K2.vietri-flat.2",
    theme,
  });

  it("inlines the theme tokens as hex (no CSS variables)", () => {
    expect(mail.html).toContain("#7d4f9c"); // accent
    expect(mail.html).toContain("#2b2330"); // dark
    expect(mail.html).toContain("#fbe9e4"); // light
    expect(mail.html).not.toContain("var(--");
  });

  it("shows the code and the localized copy", () => {
    expect(mail.subject).toContain("MK-1042");
    expect(mail.html).toContain("MK-1042");
    expect(mail.html).toContain("Takk for bestillingen"); // NO locale
  });

  it("includes the CA-3 reopen-set link", () => {
    expect(mail.html).toContain("configurator?set=MK-A-K2.vietri-flat.2");
    expect(mail.text).toContain("configurator?set=MK-A-K2.vietri-flat.2");
  });

  it("keeps a plain-text fallback", () => {
    expect(mail.text).toContain("MK-1042");
    expect(mail.text).toContain("2× Vietri Flat");
  });

  it("omits the reopen link gracefully when there's no set", () => {
    const m = customerEmail({ name: "Kari", code: "MK-1", locale: "en", items, setUrl: null, theme });
    expect(m.html).not.toContain("configurator?set=");
    expect(m.html).toContain("Thank you for your order"); // EN locale
  });

  it("escapes the customer note in the customer email (R2-2b AC6)", () => {
    const out = customerEmail({
      name: "Kari",
      code: "MK-1",
      locale: "no",
      items: [
        {
          productName: "Flat",
          quantity: 1,
          unitPriceCents: 50000,
          currency: "NOK",
          configCode: "MK-D-A",
          customNote: "<b>brun hund</b>",
        },
      ],
      setUrl: null,
      theme: { light: "#eee", dark: "#222", accent: "#933" },
    });
    expect(out.html).toContain("&lt;b&gt;brun hund&lt;/b&gt;");
    expect(out.html).not.toContain("<b>brun hund</b>");
  });

  it("renders the inscription escaped, only when present (F38)", () => {
    const out = customerEmail({
      name: "Kari",
      code: "MK-1",
      locale: "no",
      items: [
        {
          productName: "Flat",
          quantity: 1,
          unitPriceCents: 50000,
          currency: "NOK",
          configCode: "MK-D-A",
          customText: "Hei & Åse",
        },
      ],
      setUrl: null,
      theme: { light: "#eee", dark: "#222", accent: "#933" },
    });
    expect(out.html).toContain("«Hei &amp; Åse»");
  });
});

describe("adminEmail / supplierEmail", () => {
  it("admin email carries the code, customer and accent colour", () => {
    const m = adminEmail({
      code: "MK-1042",
      customerName: "Kari",
      customerEmail: "kari@example.com",
      items,
      theme,
      replicaUrl: null,
    });
    expect(m.subject).toContain("MK-1042");
    expect(m.html).toContain("kari@example.com");
    expect(m.html).toContain("#7d4f9c");
  });

  it("admin email includes the Replica-set link when present, omits it otherwise (R2-6 D)", () => {
    const url = "https://minkeramikk.no/no/configurator?step=3&set=MK-A-K2.vietri-flat.2";
    const withLink = adminEmail({
      code: "MK-1042", customerName: "Kari", customerEmail: "kari@example.com",
      items, theme, replicaUrl: url,
    });
    // the href is HTML-escaped (& → &amp;); assert on the set payload + the raw url in text
    expect(withLink.html).toContain("set=MK-A-K2.vietri-flat.2");
    expect(withLink.html).toContain("Replica set");
    expect(withLink.text).toContain(url);

    const without = adminEmail({
      code: "MK-1042", customerName: "Kari", customerEmail: "kari@example.com",
      items, theme, replicaUrl: null,
    });
    expect(without.html).not.toContain("configurator?step=3");
  });

  it("supplier email is branded and references the order", () => {
    const m = supplierEmail({ orderCode: "MK-1042", supplierName: "Vietri", theme });
    expect(m.subject).toContain("MK-1042");
    expect(m.html).toContain("Vietri");
    expect(m.html).toContain("#7d4f9c");
    expect(m.text).toContain("production order MK-1042");
  });
});

describe("discounted emails (R4-SCONTI)", () => {
  const baseParams = {
    name: "Kari",
    code: "MK-1042",
    locale: "no" as const,
    setUrl: null,
    theme,
  };
  const baseAdminParams = {
    code: "MK-1042",
    customerName: "Kari",
    customerEmail: "kari@example.com",
    theme,
    replicaUrl: null,
  };
  const discounted: MailItem = {
    productName: "Deluxe tallerken",
    quantity: 8,
    unitPriceCents: 74900,
    currency: "NOK",
    configCode: "MK-A-b1",
    discountPct: 10,
    discountCents: 59920,
  };

  it("the customer email shows full struck through, net, and the percentage", () => {
    const m = customerEmail({ ...baseParams, items: [discounted] });
    expect(m.html).toContain("<s "); // full price struck through (not "<span")
    expect(m.html).toMatch(/−\s?10\s?%/);
    expect(m.text).toContain("-10%");
    // the total is the NET one
    expect(m.text).toContain("5 392,80"); // 599 200 − 59 920 øre, nb-NO
  });

  it("an undiscounted item renders exactly as before (regression)", () => {
    const m = customerEmail({
      ...baseParams,
      items: [{ ...discounted, discountPct: undefined, discountCents: undefined }],
    });
    expect(m.html).not.toContain("<s ");
    expect(m.text).not.toContain("%");
  });

  it("the admin email carries the same numbers (what was promised)", () => {
    const m = adminEmail({ ...baseAdminParams, items: [discounted] });
    expect(m.text).toContain("-10%");
  });

  it("D5 — shipping reads the NET total, not the gross: an item whose gross clears the threshold but whose net (after its discount) does not shows 'to be confirmed', never 'included'", () => {
    // gross = 100 000 øre (exactly the 1 000 NOK default threshold, so a
    // gross-based read would show it included); net after the 10% discount
    // is 90 000 øre, below the threshold — D5 says the shop confirms shipping
    // by hand in that case.
    const item: MailItem = {
      productName: "Deluxe tallerken",
      quantity: 1,
      unitPriceCents: 100_000,
      currency: "NOK",
      configCode: "MK-A-b1",
      discountPct: 10,
      discountCents: 10_000,
    };
    const m = customerEmail({ ...baseParams, items: [item] });
    expect(m.html).toContain("Beregnes");
    expect(m.text).toContain("Beregnes");
    expect(m.html).not.toContain("Inkludert");
  });
});

/**
 * R4-TAKK-MAIL: the mail's payment block. The load-bearing assertion is not
 * "the block renders" but "it survives images being blocked" — so every test
 * here checks the TEXT facts (number, recipient, order code, melding warning),
 * never the <img>.
 */
describe("payment block (R4-TAKK-MAIL)", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  });
  const base = { name: "Kari", code: "MK-1042", items, setUrl: null, theme };
  const full: VippsSettings = {
    qrImage: "settings/vipps-qr.png",
    number: "123456",
    link: "https://qr.vipps.no/box/abc",
  };

  it("renders number, recipient and the melding warning in html AND text", () => {
    const m = customerEmail({ ...base, locale: "no", vipps: full });
    for (const body of [m.html, m.text]) {
      expect(body).toContain("123456");
      expect(body).toContain("Min Keramikk AS");
      expect(body).toContain("Vippsnummer");
      expect(body).toContain("meldingsfeltet");
      expect(body).toContain("MK-1042");
    }
  });

  it("does the same in English", () => {
    const m = customerEmail({ ...base, locale: "en", vipps: full });
    for (const body of [m.html, m.text]) {
      expect(body).toContain("Vipps number");
      expect(body).toContain("message field in Vipps");
      expect(body).toContain("MK-1042");
    }
  });

  it("stays payable with images blocked: nothing load-bearing lives in the QR", () => {
    const m = customerEmail({ ...base, locale: "no", vipps: full });
    // strip every <img> — what a client with remote images off effectively shows
    const withoutImages = m.html.replace(/<img[^>]*>/g, "");
    expect(withoutImages).toContain("123456");
    expect(withoutImages).toContain("Min Keramikk AS");
    expect(withoutImages).toContain("meldingsfeltet");
    expect(withoutImages).toContain("MK-1042");
  });

  it("inlines the --warn tints as literal hex (mail clients resolve neither var() nor color-mix())", () => {
    const m = customerEmail({ ...base, locale: "no", vipps: full });
    expect(m.html).toContain("#f7ede4");
    expect(m.html).toContain("#6d3f00");
    expect(m.html).not.toContain("color-mix");
    expect(m.html).not.toContain("var(--");
  });

  it("shows the QR as an <img> from the assets bucket, with a real alt", () => {
    const m = customerEmail({ ...base, locale: "no", vipps: full });
    expect(m.html).toContain("/storage/v1/object/public/assets/settings/vipps-qr");
    expect(m.html).toContain('alt="Vipps QR-kode"');
    expect(m.html).toContain('width="104" height="104"');
  });

  it("NO_VIPPS (and an absent param) leave no trace of the block, and the mail stays complete", () => {
    for (const m of [
      customerEmail({ ...base, locale: "no", vipps: NO_VIPPS }),
      customerEmail({ ...base, locale: "no" }),
    ]) {
      expect(m.html).not.toContain("Slik betaler du");
      expect(m.html).not.toContain("Vippsnummer");
      expect(m.html).not.toContain("#f7ede4");
      expect(m.text).not.toContain("Vipps");
      // still a complete receipt
      expect(m.html).toContain("Takk for bestillingen");
      expect(m.text).toContain("MK-1042");
      expect(m.text).toContain("2× Vietri Flat");
    }
  });

  it("QR but no number yet (today's real state) still reads sensibly", () => {
    const m = customerEmail({
      ...base,
      locale: "no",
      vipps: { qrImage: "settings/vipps-qr.png", number: null, link: null },
    });
    expect(m.html).toContain("Slik betaler du");
    expect(m.html).toContain("Min Keramikk AS");
    expect(m.html).toContain("meldingsfeltet");
    // no empty "Vippsnummer" label dangling over a missing number
    expect(m.html).not.toContain("Vippsnummer");
    expect(m.text).not.toContain("Vippsnummer");
  });

  it("number but no QR: no <img>, and the block still carries everything", () => {
    const m = customerEmail({
      ...base,
      locale: "no",
      vipps: { qrImage: null, number: "123456", link: null },
    });
    expect(m.html).toContain("123456");
    expect(m.html).not.toContain("vipps-qr");
  });
});
