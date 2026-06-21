import "server-only";

import { Resend } from "resend";
import { getThemeTokensSafe } from "@/lib/theme.server";
import { siteUrl } from "@/lib/site";
import { encodeSetParam } from "@/lib/cart/set-code";
import { customerEmail, adminEmail, type MailItem } from "./email-html";
import type { OrderItemInput } from "./schema";

/**
 * Order emails (F05 + F30): a branded HTML confirmation to the customer in
 * THEIR language (orders.locale) + an admin notification, both multipart
 * (HTML with the F05 plain-text kept as fallback). Brand colours are read from
 * `settings` at send time and inlined as hex, so a back-office theme change
 * re-colours the next emails. Transport is injectable so tests use a mock and
 * CI sends nothing real; production uses Resend when RESEND_API_KEY is set.
 */

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Branded HTML body (F30). When present the message is sent multipart. */
  html?: string;
  /** Optional file attachments (F08: the supplier production-order PDF). */
  attachments?: EmailAttachment[];
}

export interface EmailTransport {
  send(msg: EmailMessage): Promise<void>;
}

/** Default transport: Resend if configured, else a dev/CI console no-op. */
export function defaultTransport(): EmailTransport {
  const key = process.env.RESEND_API_KEY;
  // Until the minkeramikk.no domain is DNS-verified in Resend, fall back to the
  // Resend test sender (onboarding@resend.dev). Switch ORDER_EMAIL_FROM to
  // bestilling@minkeramikk.no once the domain is verified.
  const from = process.env.ORDER_EMAIL_FROM || "Min Keramikk <onboarding@resend.dev>";
  if (!key) {
    return {
      async send(msg) {
        console.log(`[email:noop] → ${msg.to} :: ${msg.subject}`);
      },
    };
  }
  const resend = new Resend(key);
  return {
    async send(msg) {
      await resend.emails.send({
        from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
        ...(msg.attachments && msg.attachments.length > 0
          ? { attachments: msg.attachments.map((a) => ({ filename: a.filename, content: a.content })) }
          : {}),
      });
    },
  };
}

const toMailItem = (i: OrderItemInput): MailItem => ({
  productName: i.productName,
  quantity: i.quantity,
  unitPriceCents: i.unitPriceCents,
  currency: i.currency,
  configCode: i.configCode,
  customNote: i.configSnapshot?.customNote || undefined,
});

/**
 * "Reopen your set" link for the customer email → the order confirmation page
 * (/order?code=…&set=…), which recaps the set with mini-plates and a share
 * button. Null when no line is shareable. The set-code alphabet is URL-safe by
 * design, so the param stays raw/readable.
 */
function reopenSetUrl(
  items: OrderItemInput[],
  locale: "no" | "en",
  code: string
): string | null {
  const param = encodeSetParam(
    items.map((i) => ({
      configCode: i.configCode,
      productSlug: i.productSlug,
      quantity: i.quantity,
    }))
  );
  if (!param) return null;
  return `${siteUrl()}/${locale}/order?code=${encodeURIComponent(code)}&set=${param}`;
}

export async function sendOrderEmails(
  params: {
    code: string;
    customerName: string;
    customerEmail: string;
    locale: "no" | "en";
    items: OrderItemInput[];
  },
  transport: EmailTransport = defaultTransport()
): Promise<void> {
  const theme = await getThemeTokensSafe();
  const items = params.items.map(toMailItem);

  const customer = customerEmail({
    name: params.customerName,
    code: params.code,
    locale: params.locale,
    items,
    setUrl: reopenSetUrl(params.items, params.locale, params.code),
    theme,
  });
  await transport.send({
    to: params.customerEmail,
    subject: customer.subject,
    text: customer.text,
    html: customer.html,
  });

  const admin = adminEmail({
    code: params.code,
    customerName: params.customerName,
    customerEmail: params.customerEmail,
    items,
    theme,
  });
  const adminTo = process.env.ORDER_NOTIFY_EMAIL || "dangeli88.daniele@gmail.com";
  await transport.send({
    to: adminTo,
    subject: admin.subject,
    text: admin.text,
    html: admin.html,
  });
}
