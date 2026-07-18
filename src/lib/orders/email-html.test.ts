import { describe, it, expect } from "vitest";
import { customerEmail, adminEmail, supplierEmail, type MailItem } from "./email-html";
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
