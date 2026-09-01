/**
 * Status emails (R4-ORDERS, ADR 0021): the customer notifications sent —
 * only on an explicit admin tick — when an order's payment is registered, it
 * enters production, or it ships. PURE, like email-html.ts: the theme tokens
 * are passed in, so both renderers are unit-testable and the SAME text the
 * admin previews in the confirm dialog is the text that leaves.
 *
 * ponytail: no totals and no prices in these mails. The amounts already live in
 * the F05/F30 confirmation; repeating them here would mean re-deriving Money in
 * a place that has no order lines, and would hardcode a currency into copy that
 * may have to serve an EUR market later.
 */
import { esc, shell, journeyHtml, journeyText, type RenderedEmail } from "./email-html";
import { currentStep } from "./order-journey";
import type { ThemeTokens } from "@/lib/theme";
import type { OrderStatus } from "./order-status";

/** The statuses that notify the customer. Everything else is silent.
 *
 *  R4-MAIL-JOURNEY §D: `confirmed` has retired. With four journey steps,
 *  `confirmed` and `in_production` land on the SAME dot, and two mails in a row
 *  showing an identical bar are worse than one mail fewer. The status stays in
 *  the back-office for Alessio; it just stops writing to the customer. */
export const EMAIL_STATUSES = ["in_production", "shipped"] as const;

type EmailStatus = (typeof EMAIL_STATUSES)[number];

/** What copy leaves. `paid` is not an order status (it is `orders.paid_at`), so
 *  it is a mail KIND, not a status — the journey block still reads the real
 *  status + paid_at, never the kind. */
export type MailKind = EmailStatus | "paid";

export function canEmail(status: OrderStatus): status is EmailStatus {
  return (EMAIL_STATUSES as readonly string[]).includes(status);
}

export interface StatusEmailParams {
  status: OrderStatus;
  /** Which mail this is. Defaults to `status` for the two status mails; the
   *  payment mail passes "paid" while the order's status is still whatever it
   *  was (usually `new`). */
  kind?: MailKind;
  code: string;
  customerName: string;
  locale: "no" | "en";
  /** Quoted in the shipping mail when present. */
  trackingCode?: string | null;
  /** Feeds the journey block: any timestamp means the payment step happened. */
  paidAt?: string | null;
  /** The moment the mail is written — the journey block is a snapshot. */
  journeyAt?: Date;
}

/** Null when there is no mail to send for these params. */
function mailKind(p: StatusEmailParams): MailKind | null {
  if (p.kind) return p.kind;
  return canEmail(p.status) ? p.status : null;
}

interface Copy {
  subject: (code: string) => string;
  heading: string;
  body: string[];
}

interface LocaleCopy extends Record<MailKind, Copy> {
  greeting: (n: string) => string;
  signature: string;
  trackingLabel: string;
}

/** NO/EN parity, F30 pattern: the copy lives here, not in next-intl — these
 *  messages render outside a request/locale context and must stay pure. */
const COPY: Record<"no" | "en", LocaleCopy> = {
  no: {
    // TODO:nb-review — nuovi testi R4-ORDERS, revisione del cliente
    greeting: (n) => `Hei ${n},`,
    signature: "Min Keramikk",
    trackingLabel: "Sporingsnummer",
    // R4-MAIL-JOURNEY §C — TODO:nb-review
    paid: {
      subject: (code) => `Betalingen er registrert — bestilling ${code}`,
      heading: "Vi har mottatt betalingen din",
      body: [
        "Takk! Betalingen for bestillingen din er registrert, og nå setter vi i gang. Keramikken males for hånd i Italia.",
        "Vi skriver igjen så snart bestillingen er klar til å sendes.",
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
    paid: {
      subject: (code) => `Payment received — order ${code}`,
      heading: "We have received your payment",
      body: [
        "Thank you! Your payment has been registered and we are getting started. Your ceramics are hand-painted in Italy.",
        "We will write again as soon as your order is ready to ship.",
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

/** Extra lines appended to a status mail, when they apply.
 *  R4-MAIL-JOURNEY: the payment line is GONE from here — the journey block now
 *  states it, and saying it twice in one mail reads like a bug. */
function extras(p: StatusEmailParams): { label: string; value?: string }[] {
  const c = COPY[p.locale];
  return p.status === "shipped" && p.trackingCode
    ? [{ label: c.trackingLabel, value: p.trackingCode }]
    : [];
}

/** Subject + plain text. Null when the status does not notify.
 *  This is what the admin sees in the confirm dialog. */
export function statusEmailText(
  p: StatusEmailParams
): { subject: string; text: string } | null {
  const kind = mailKind(p);
  if (!kind) return null;
  const c = COPY[p.locale];
  const s = c[kind];
  const step = currentStep(p.status, p.paidAt);
  const lines = [
    c.greeting(p.customerName),
    "",
    ...s.body,
    "",
    ...extras(p).map((e) => (e.value ? `${e.label}: ${e.value}` : e.label)),
    // cancelled (or anything unmappable) draws no journey at all.
    ...(step === null ? [] : [journeyText(p.locale, step, p.journeyAt ?? new Date())]),
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
  const kind = mailKind(p)!; // statusEmailText already returned non-null
  const s = c[kind];
  const step = currentStep(p.status, p.paidAt);
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
    extraHtml +
    (step === null ? "" : journeyHtml(p.theme, p.locale, step, p.journeyAt ?? new Date()));
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
