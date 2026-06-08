import "server-only";

import { Resend } from "resend";
import { formatMoney, money } from "@/lib/money/money";
import type { Currency } from "@/lib/money/money";
import type { OrderItemInput } from "./schema";

/**
 * Order emails (F05 AC5): a confirmation to the customer in THEIR language
 * (orders.locale) + an admin notification. The transport is injectable so
 * tests use a mock and CI sends nothing real; production uses Resend when
 * RESEND_API_KEY is set, otherwise a no-op console transport.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
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
      });
    },
  };
}

function lineSummary(
  items: OrderItemInput[],
  locale: "no" | "en"
): { lines: string; total: string } {
  const lines = items
    .map(
      (i) =>
        `- ${i.quantity}× ${i.productName} [${i.configCode}] — ${formatMoney(
          money(i.unitPriceCents * i.quantity, i.currency as Currency),
          locale
        )}`
    )
    .join("\n");
  const total = formatMoney(
    money(
      items.reduce((n, i) => n + i.unitPriceCents * i.quantity, 0),
      (items[0]?.currency ?? "NOK") as Currency
    ),
    locale
  );
  return { lines, total };
}

const CUSTOMER_COPY = {
  no: {
    subject: (code: string) => `Din bestilling ${code} — Min Keramikk`,
    body: (name: string, code: string, lines: string, total: string) =>
      `Hei ${name},\n\nTakk for bestillingen din! Bestillingskode: ${code}.\n\n${lines}\n\nTotalt: ${total}\n\nDette er en spesialbestilling — vi tar kontakt for å bekrefte designet før noe skal betales.\n\nMin Keramikk`,
  },
  en: {
    subject: (code: string) => `Your order ${code} — Min Keramikk`,
    body: (name: string, code: string, lines: string, total: string) =>
      `Hi ${name},\n\nThank you for your order! Order code: ${code}.\n\n${lines}\n\nTotal: ${total}\n\nThis is a custom order — we'll get in touch to confirm the design before anything is paid.\n\nMin Keramikk`,
  },
} as const;

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
  const { lines, total } = lineSummary(params.items, params.locale);
  const copy = CUSTOMER_COPY[params.locale];

  await transport.send({
    to: params.customerEmail,
    subject: copy.subject(params.code),
    text: copy.body(params.customerName, params.code, lines, total),
  });

  const adminTo = process.env.ORDER_NOTIFY_EMAIL || "dangeli88.daniele@gmail.com";
  await transport.send({
    to: adminTo,
    subject: `New order ${params.code} (${params.customerName})`,
    text: `Order ${params.code} from ${params.customerName} <${params.customerEmail}>\n\n${lines}\n\nTotal: ${total}`,
  });
}
