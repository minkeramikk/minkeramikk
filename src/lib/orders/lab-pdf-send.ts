import { defaultTransport, type EmailTransport } from "./email";
import { getThemeTokensSafe } from "@/lib/theme.server";
import { supplierEmail } from "./email-html";

/**
 * Send a production-order PDF to a supplier (F08 + F30 branded HTML). The
 * transport is injectable so tests use a mock and CI never sends. A supplier
 * without an email yields a warning (the PDF is still generated/downloadable)
 * — never an error.
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

  const theme = await getThemeTokensSafe();
  const mail = supplierEmail({
    orderCode: params.orderCode,
    supplierName: params.supplierName,
    theme,
  });
  await transport.send({
    to: params.supplierEmail,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: [
      { filename: `production-order-${params.orderCode}.pdf`, content: params.pdf },
    ],
  });

  return { sent: true, warning: null };
}
