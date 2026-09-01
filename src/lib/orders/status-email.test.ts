import { describe, it, expect } from "vitest";
import { canEmail, statusEmail, statusEmailText } from "./status-email";
import type { ThemeTokens } from "@/lib/theme";

const theme: ThemeTokens = { light: "#fbe9e4", dark: "#2b2330", accent: "#7d4f9c" };
const base = { code: "MK-1042", customerName: "Kari", locale: "no" as const };

describe("canEmail", () => {
  it("only the two notifying statuses can mail — 'confirmed' has retired", () => {
    expect(canEmail("in_production")).toBe(true);
    expect(canEmail("shipped")).toBe(true);
    expect(canEmail("confirmed")).toBe(false);
    expect(canEmail("new")).toBe(false);
    expect(canEmail("delivered")).toBe(false);
    expect(canEmail("cancelled")).toBe(false);
    expect(canEmail("contacted")).toBe(false);
  });
});

describe("statusEmailText — the admin preview", () => {
  it("returns null for a status that does not mail", () => {
    expect(statusEmailText({ ...base, status: "new" })).toBeNull();
  });

  it("is Norwegian for a NO customer and English for an EN one", () => {
    expect(statusEmailText({ ...base, status: "in_production" })!.text).toContain("Hei Kari");
    expect(
      statusEmailText({ ...base, locale: "en", status: "in_production" })!.text
    ).toContain("Hi Kari");
  });

  it("carries the order code in the subject of every status", () => {
    for (const status of ["in_production", "shipped"] as const) {
      expect(statusEmailText({ ...base, status })!.subject).toContain("MK-1042");
    }
  });

  it("quotes the tracking code in the shipping mail, and says so when there is none", () => {
    const withCode = statusEmailText({
      ...base, status: "shipped", trackingCode: "NO123456789",
    })!;
    expect(withCode.text).toContain("NO123456789");
    const without = statusEmailText({ ...base, status: "shipped" })!;
    expect(without.text).not.toContain("NO123456789");
    expect(without.text).not.toMatch(/undefined|null/);
  });

  it("prints no amount and no currency symbol", () => {
    const t = statusEmailText({ ...base, status: "in_production" })!.text;
    expect(t).not.toMatch(/\bkr\b|€|\$/);
  });
});

describe("statusEmail — the sent message", () => {
  const mail = statusEmail({
    ...base, status: "shipped", trackingCode: "NO123456789", theme,
  })!;

  it("inlines the theme tokens as hex, never CSS variables", () => {
    expect(mail.html).toContain("#7d4f9c");
    expect(mail.html).not.toContain("var(--");
  });

  it("keeps the plain-text fallback in sync with the preview", () => {
    expect(mail.text).toBe(
      statusEmailText({ ...base, status: "shipped", trackingCode: "NO123456789" })!.text
    );
    expect(mail.subject).toBe(
      statusEmailText({ ...base, status: "shipped", trackingCode: "NO123456789" })!.subject
    );
  });

  it("escapes a hostile tracking code", () => {
    const m = statusEmail({ ...base, status: "shipped", trackingCode: "<b>x</b>", theme })!;
    expect(m.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(m.html).not.toContain("<b>x</b>");
  });
});

describe("the paid mail (R4-MAIL-JOURNEY §C)", () => {
  const at = new Date("2026-09-01T10:00:00Z");
  const paid = {
    ...base,
    kind: "paid" as const,
    status: "new" as const,
    paidAt: "2026-09-01T09:00:00Z",
    journeyAt: at,
  };

  it("has the mockup's subject and heading, NO and EN", () => {
    const no = statusEmail({ ...paid, theme })!;
    expect(no.subject).toBe("Betalingen er registrert — bestilling MK-1042");
    expect(no.html).toContain("Vi har mottatt betalingen din");

    const en = statusEmail({ ...paid, locale: "en", theme })!;
    expect(en.subject).toBe("Payment received — order MK-1042");
    expect(en.html).toContain("We have received your payment");
  });

  it("stands on 'paid': received and paid are ticked, production is not", () => {
    const mail = statusEmail({ ...paid, theme })!;
    expect(mail.text).toContain("[x] Bestillingen er mottatt");
    expect(mail.text).toContain("[x] Betalingen er registrert · nå");
    expect(mail.text).toContain("[ ] Keramikken lages for hånd");
  });

  it("says nothing about the payment twice — the journey block is the only carrier", () => {
    const mail = statusEmail({ ...paid, theme })!;
    const hits = mail.text.split("Betalingen er registrert").length - 1;
    expect(hits).toBe(1);
  });
});

describe("the journey block travels in every status mail", () => {
  const at = new Date("2026-09-01T10:00:00Z");

  it("in_production stands on production, in html and in text", () => {
    const mail = statusEmail({ ...base, status: "in_production", theme, journeyAt: at })!;
    expect(mail.text).toContain("[x] Keramikken lages for hånd · nå");
    expect(mail.text).toContain("[ ] Sendt med forsikret frakt");
    expect(mail.html).toContain("Keramikken lages for hånd");
    expect(mail.html).toContain("Status 1. september 2026");
  });

  it("shipped stands on the last step, everything ticked", () => {
    const mail = statusEmail({ ...base, status: "shipped", theme, journeyAt: at })!;
    expect(mail.text).toContain("[x] Sendt med forsikret frakt · nå");
    expect(mail.text).not.toContain("[ ]");
  });

  it("an unmappable status renders no journey at all", () => {
    // cancelled never mails, but the renderer must not be able to draw a wrong
    // index if it is ever handed one.
    const mail = statusEmail({
      ...base, kind: "shipped", status: "cancelled", theme, journeyAt: at,
    })!;
    expect(mail.text).not.toContain("[x]");
    expect(mail.html).not.toContain("Hvor bestillingen din står");
  });
});
