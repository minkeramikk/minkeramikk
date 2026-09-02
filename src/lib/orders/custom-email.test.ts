import { describe, it, expect } from "vitest";
import { customMessageEmail, defaultMessageSubject } from "./custom-email";

const theme = { light: "#fbe9e4", dark: "#2b2330", accent: "#7d4f9c" };
const base = { subject: "Om bestillingen MK-1042", customerName: "Kari", theme };

describe("customMessageEmail — what the admin sees is what leaves", () => {
  it("the text IS the body, untouched", () => {
    const m = customMessageEmail({ ...base, body: "Hei Kari\n\nTakk for bestillingen!" });
    expect(m.text).toBe("Hei Kari\n\nTakk for bestillingen!");
  });

  it("paragraphs survive into the HTML, and so do single line breaks", () => {
    const m = customMessageEmail({ ...base, body: "Første\nlinje\n\nAndre" });
    expect(m.html).toContain("Første<br>linje");
    expect(m.html.match(/<p style="margin:0 0 10px;">/g)).toHaveLength(2);
  });

  it("the HTML goes through the branded shell", () => {
    const m = customMessageEmail({ ...base, body: "Hei" });
    expect(m.html).toContain("<!DOCTYPE html>");
    expect(m.html).toContain(theme.accent);
  });

  it("markup typed or pasted into the box is ESCAPED, never injected", () => {
    const m = customMessageEmail({ ...base, body: "<b>x</b>" });
    expect(m.html).not.toContain("<b>x</b>");
    expect(m.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("the subject rides into the preheader and the heading", () => {
    const m = customMessageEmail({ ...base, body: "Hei" });
    expect(m.subject).toBe("Om bestillingen MK-1042");
    expect(m.html).toContain("Om bestillingen MK-1042");
  });

  it("the default subject names the order", () => {
    expect(defaultMessageSubject("MK-1042")).toBe("Om bestillingen MK-1042");
  });
});
