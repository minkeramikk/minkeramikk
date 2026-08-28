/**
 * Status emails (R4-ORDERS, ADR 0021): the three customer notifications sent —
 * only on an explicit admin tick — when an order becomes confirmed, enters
 * production, or ships. PURE, like email-html.ts: the theme tokens are passed
 * in, so both renderers are unit-testable and the SAME text the admin previews
 * in the confirm dialog is the text that leaves.
 *
 * ponytail: no totals and no prices in these mails. The amounts already live in
 * the F05/F30 confirmation; repeating them here would mean re-deriving Money in
 * a place that has no order lines, and would hardcode a currency into copy that
 * may have to serve an EUR market later.
 */
import { esc, shell, type RenderedEmail } from "./email-html";
import type { ThemeTokens } from "@/lib/theme";
import type { OrderStatus } from "./order-status";

/** The statuses that notify the customer. Everything else is silent. */
export const EMAIL_STATUSES = ["confirmed", "in_production", "shipped"] as const;

type EmailStatus = (typeof EMAIL_STATUSES)[number];

export function canEmail(status: OrderStatus): status is EmailStatus {
  return (EMAIL_STATUSES as readonly string[]).includes(status);
}

export interface StatusEmailParams {
  status: OrderStatus;
  code: string;
  customerName: string;
  locale: "no" | "en";
  /** Quoted in the shipping mail when present. */
  trackingCode?: string | null;
  /** When set, the mail carries the "payment registered" line. */
  paidAt?: string | null;
}

interface Copy {
  subject: (code: string) => string;
  heading: string;
  body: string[];
}

interface LocaleCopy extends Record<EmailStatus, Copy> {
  greeting: (n: string) => string;
  signature: string;
  trackingLabel: string;
  paidLabel: string;
}

/** NO/EN parity, F30 pattern: the copy lives here, not in next-intl — these
 *  messages render outside a request/locale context and must stay pure. */
const COPY: Record<"no" | "en", LocaleCopy> = {
  no: {
    // TODO:nb-review — nuovi testi R4-ORDERS, revisione del cliente
    greeting: (n) => `Hei ${n},`,
    signature: "Min Keramikk",
    trackingLabel: "Sporingsnummer",
    paidLabel: "Betaling registrert",
    confirmed: {
      subject: (code) => `Bestillingen ${code} er bekreftet — Min Keramikk`,
      heading: "Bestillingen er bekreftet",
      body: [
        "Vi har gått gjennom designet ditt og bekreftet bestillingen.",
        "Neste steg er produksjon hos verkstedet vårt i Italia. Vi gir deg beskjed når arbeidet starter.",
      ],
    },
    in_production: {
      subject: (code) => `Bestillingen ${code} er i produksjon — Min Keramikk`,
      heading: "Bestillingen er i produksjon",
      body: [
        "Keramikken din er nå under arbeid hos verkstedet.",
        "Alt lages for hånd og til din bestilling, så det tar litt tid. Vi sier fra så snart den er sendt.",
      ],
    },
    shipped: {
      subject: (code) => `Bestillingen ${code} er sendt — Min Keramikk`,
      heading: "Bestillingen er sendt",
      body: [
        "Pakken din er på vei.",
        "Alt er fortollet og forsikret — du skal ikke betale noe ekstra ved levering.",
      ],
    },
  },
  en: {
    greeting: (n) => `Hi ${n},`,
    signature: "Min Keramikk",
    trackingLabel: "Tracking number",
    paidLabel: "Payment registered",
    confirmed: {
      subject: (code) => `Order ${code} confirmed — Min Keramikk`,
      heading: "Your order is confirmed",
      body: [
        "We have gone through your design and confirmed the order.",
        "Next comes production at our workshop in Italy. We will let you know when the work starts.",
      ],
    },
    in_production: {
      subject: (code) => `Order ${code} is in production — Min Keramikk`,
      heading: "Your order is in production",
      body: [
        "Your ceramics are now being made at the workshop.",
        "Everything is handmade to your order, so it takes a little time. We will write again as soon as it ships.",
      ],
    },
    shipped: {
      subject: (code) => `Order ${code} has shipped — Min Keramikk`,
      heading: "Your order has shipped",
      body: [
        "Your parcel is on its way.",
        "Everything is customs-cleared and insured — there is nothing extra to pay on delivery.",
      ],
    },
  },
};

/** Extra lines appended to every status mail, when they apply. */
function extras(p: StatusEmailParams): { label: string; value?: string }[] {
  const c = COPY[p.locale];
  const out: { label: string; value?: string }[] = [];
  if (p.status === "shipped" && p.trackingCode) {
    out.push({ label: c.trackingLabel, value: p.trackingCode });
  }
  // The payment line is a statement, not a field: "Betaling registrert".
  if (p.paidAt) out.push({ label: c.paidLabel });
  return out;
}

/** Subject + plain text. Null when the status does not notify.
 *  This is what the admin sees in the confirm dialog. */
export function statusEmailText(
  p: StatusEmailParams
): { subject: string; text: string } | null {
  if (!canEmail(p.status)) return null;
  const c = COPY[p.locale];
  const s = c[p.status];
  const lines = [
    c.greeting(p.customerName),
    "",
    ...s.body,
    "",
    ...extras(p).map((e) => (e.value ? `${e.label}: ${e.value}` : e.label)),
    "",
    c.signature,
  ];
  return {
    subject: s.subject(p.code),
    text: lines.join("\n").replace(/\n{3,}/g, "\n\n"),
  };
}

/** The message actually sent: same subject/text, plus the branded F30 shell. */
export function statusEmail(
  p: StatusEmailParams & { theme: ThemeTokens; baseUrl?: string }
): RenderedEmail | null {
  const plain = statusEmailText(p);
  if (!plain) return null;
  const c = COPY[p.locale];
  const s = c[p.status as EmailStatus];
  const extraHtml = extras(p)
    .map((e) =>
      e.value
        ? `<p style="margin:8px 0 0;"><span style="opacity:.65;">${esc(
            e.label
          )}:</span> <strong>${esc(e.value)}</strong></p>`
        : `<p style="margin:8px 0 0;"><strong>${esc(e.label)}</strong></p>`
    )
    .join("");
  const bodyHtml =
    `<p style="margin:0 0 12px;">${esc(c.greeting(p.customerName))}</p>` +
    s.body.map((b) => `<p style="margin:0 0 10px;">${esc(b)}</p>`).join("") +
    extraHtml;
  return {
    subject: plain.subject,
    text: plain.text,
    html: shell(p.theme, {
      preheader: plain.subject,
      heading: s.heading,
      bodyHtml,
      logoUrl: p.baseUrl ? `${p.baseUrl}/logo-white.png` : undefined,
    }),
  };
}
