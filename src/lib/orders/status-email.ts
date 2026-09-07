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
import { displayName } from "./customer-name";
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
    signature: "Hilsen oss i Min Keramikk",
    trackingLabel: "Sporingsnummer",
    // R4-MAIL-COPY Ⓓ — the client's own Norwegian (doc 2/9, p.3-4)
    paid: {
      subject: (code) => `Betalingen er registrert — bestilling ${code}`,
      heading: "Vi har mottatt betalingen din",
      body: [
        "Tusen takk for betalingen din! Da er ordren din registrert hos oss og vi sender den videre til våre keramikere i Italia. Vi gir deg en oppdatering så snart produksjonen er i gang.",
      ],
    },
    in_production: {
      subject: (code) => `Bestillingen ${code} er i produksjon — Min Keramikk`,
      heading: "Bestillingen er i produksjon",
      body: [
        "Keramikken din er nå under produksjon i Italia!",
        "Alt males for hånd spesielt for deg, så det tar litt tid, men vi gir deg en lyd så snart den er klar til å sendes.",
      ],
    },
    shipped: {
      subject: (code) => `Bestillingen er sendt — bestilling ${code}`,
      heading: "Bestillingen er sendt",
      body: [
        "Pakken din er på vei.",
        "Alt er fortollet og forsikret — du skal ikke betale noe ekstra ved levering.",
      ],
    },
  },
  en: {
    greeting: (n) => `Hi ${n},`,
    signature: "Best regards, all of us at Min Keramikk",
    trackingLabel: "Tracking number",
    paid: {
      subject: (code) => `Payment received — order ${code}`,
      heading: "We have received your payment",
      body: [
        "Thank you very much for your payment! Your order is registered with us and we are passing it on to our ceramicists in Italy. We will update you as soon as production is under way.",
      ],
    },
    in_production: {
      subject: (code) => `Order ${code} is in production — Min Keramikk`,
      heading: "Your order is in production",
      body: [
        "Your ceramics are now in production in Italy!",
        "Everything is hand-painted especially for you, so it takes a little time, but we will let you know as soon as it is ready to ship.",
      ],
    },
    shipped: {
      subject: (code) => `Your order has been sent — order ${code}`,
      heading: "Your order has shipped",
      body: [
        "Your parcel is on its way.",
        "Everything is customs-cleared and insured — there is nothing extra to pay on delivery.",
      ],
    },
  },
};

/**
 * R4-MAIL-COPY Ⓓ: the shipping mail's tracking line has to be clickable.
 *
 * The field is free text the shop types in the back office (`trackingCode`,
 * max 120 chars) and there is no carrier-URL template anywhere in the data —
 * so a pasted `https://…` becomes a link and a bare consignment number stays
 * the text it has always been. Anything else would mean guessing a carrier
 * from a number and sending the customer to the wrong one.
 */
function trackingHref(value: string): string | null {
  return /^https?:\/\/\S+$/.test(value) ? value : null;
}

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
    c.greeting(displayName(p.customerName)),
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
    .map((e) => {
      if (!e.value) return `<p style="margin:8px 0 0;"><strong>${esc(e.label)}</strong></p>`;
      const href = trackingHref(e.value);
      const value = href
        ? `<a href="${esc(href)}" style="color:${esc(p.theme.accent)};word-break:break-all;">${esc(
            e.value
          )}</a>`
        : esc(e.value);
      return `<p style="margin:8px 0 0;"><span style="opacity:.65;">${esc(
        e.label
      )}:</span> <strong>${value}</strong></p>`;
    })
    .join("");
  const bodyHtml =
    `<p style="margin:0 0 12px;">${esc(c.greeting(displayName(p.customerName)))}</p>` +
    s.body.map((b) => `<p style="margin:0 0 10px;">${esc(b)}</p>`).join("") +
    extraHtml +
    (step === null ? "" : journeyHtml(p.theme, p.locale, step, p.journeyAt ?? new Date())) +
    // The signature only ever existed in the plain-text part; the client's doc
    // (p.3-4) closes every status mail with it, under the stepper.
    `<p style="margin:16px 0 0;">${esc(c.signature)}</p>`;
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
