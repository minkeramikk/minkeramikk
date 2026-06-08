import { defaultTransport, type EmailTransport } from "./email";

/**
 * Send a production-order PDF to a supplier (F08). The transport is injectable
 * so tests use a mock and CI never sends. A supplier without an email yields a
 * warning (the PDF is still generated/downloadable) — never an error.
 */
export interface LabPdfSendResult {
  sent: boolean;
  warning: string | null;
}

export async function sendLabPdf(
  params: {
    orderCode: string;
    supplierName: string;
    supplierEmail: string | null;
    pdf: Buffer;
  },
  transport: EmailTransport = defaultTransport()
): Promise<LabPdfSendResult> {
  if (!params.supplierEmail) {
    return {
      sent: false,
      warning: `No email on file for ${params.supplierName}. The PDF was generated but not sent.`,
    };
  }

  await transport.send({
    to: params.supplierEmail,
    subject: `Production order ${params.orderCode} — ${params.supplierName}`,
    text:
      `Hi ${params.supplierName},\n\n` +
      `Attached is the production order ${params.orderCode}. ` +
      `Please see the specification (designs, colours and quantities) in the PDF.\n\n` +
      `Min Keramikk`,
    attachments: [
      { filename: `production-order-${params.orderCode}.pdf`, content: params.pdf },
    ],
  });

  return { sent: true, warning: null };
}
