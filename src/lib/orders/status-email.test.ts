import { describe, it, expect } from "vitest";
import { canEmail, statusEmail, statusEmailText } from "./status-email";
import type { ThemeTokens } from "@/lib/theme";

const theme: ThemeTokens = { light: "#fbe9e4", dark: "#2b2330", accent: "#7d4f9c" };
const base = { code: "MK-1042", customerName: "Kari", locale: "no" as const };

describe("canEmail", () => {
  it("only the three notifying statuses can mail", () => {
    expect(canEmail("confirmed")).toBe(true);
    expect(canEmail("in_production")).toBe(true);
    expect(canEmail("shipped")).toBe(true);
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
    expect(statusEmailText({ ...base, status: "confirmed" })!.text).toContain("Hei Kari");
    expect(
      statusEmailText({ ...base, locale: "en", status: "confirmed" })!.text
    ).toContain("Hi Kari");
  });

  it("carries the order code in the subject of every status", () => {
    for (const status of ["confirmed", "in_production", "shipped"] as const) {
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

  it("adds the payment line only when paid_at is set", () => {
    const paid = statusEmailText({
      ...base, status: "confirmed", paidAt: "2026-08-28T10:00:00Z",
    })!;
    expect(paid.text).toContain("Betaling registrert");
    expect(statusEmailText({ ...base, status: "confirmed" })!.text).not.toContain(
      "Betaling registrert"
    );
  });

  it("prints no amount and no currency symbol", () => {
    const t = statusEmailText({ ...base, status: "confirmed" })!.text;
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
