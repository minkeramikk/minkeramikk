import { describe, it, expect } from "vitest";
import { sendLabPdf } from "./lab-pdf-send";
import type { EmailMessage, EmailTransport } from "./email";

function mockTransport() {
  const sent: EmailMessage[] = [];
  const transport: EmailTransport = { async send(m) { sent.push(m); } };
  return { transport, sent };
}

const pdf = Buffer.from("%PDF-1.7 fake");

describe("sendLabPdf", () => {
  it("sends to the supplier with the PDF attached", async () => {
    const { transport, sent } = mockTransport();
    const res = await sendLabPdf(
      { orderCode: "MK-1042", supplierName: "Vietri", supplierEmail: "lab@vietri.it", pdf },
      transport
    );
    expect(res).toEqual({ sent: true, warning: null });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("lab@vietri.it");
    expect(sent[0].subject).toContain("MK-1042");
    expect(sent[0].attachments?.[0].filename).toBe("production-order-MK-1042.pdf");
    expect(sent[0].attachments?.[0].content).toBe(pdf);
  });

  it("skips sending (warning) when the supplier has no email — PDF still made", async () => {
    const { transport, sent } = mockTransport();
    const res = await sendLabPdf(
      { orderCode: "MK-1042", supplierName: "No-Email Lab", supplierEmail: null, pdf },
      transport
    );
    expect(res.sent).toBe(false);
    expect(res.warning).toMatch(/no email/i);
    expect(sent).toHaveLength(0);
  });
});
