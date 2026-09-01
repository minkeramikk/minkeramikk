/**
 * Branded, email-safe HTML for the order emails (F30). PURE — no DB, no React,
 * no server-only: the theme tokens (hex) are passed in, so the render is unit
 * testable (assert the hex + the set link are present).
 *
 * Email-safe means: table layout, inline styles, hex colours (NEVER CSS
 * variables — Gmail/Outlook strip <style> and `var()`), explicit widths. Each
 * builder returns BOTH `text` (the plain fallback, unchanged from F05) and
 * `html`, so the message is sent multipart.
 */
import { formatMoney, money, subtract, sum, type Currency } from "@/lib/money/money";
import { shippingStatus } from "@/lib/cart/shipping";
import { assetUrl } from "@/lib/storage";
import { hasVippsDetails, type VippsSettings } from "./vipps";
import { JOURNEY_STEPS } from "./order-journey";
import type { ThemeTokens } from "@/lib/theme";

export interface MailItem {
  productName: string;
  quantity: number;
  unitPriceCents: number;
  currency: string;
  configCode: string;
  /** R2-2b: customer colour note. Rendered escaped; only when non-empty. */
  customNote?: string;
  /** F38: customer inscription on the ceramic. Rendered escaped, only when non-empty. */
  customText?: string;
  /** R4-SCONTI: the discount FROZEN on the order line (ADR 0022). Absent on a
   *  full-price line and on every order created before the card. */
  discountPct?: number;
  discountCents?: number;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const lineFull = (i: MailItem) => money(i.unitPriceCents * i.quantity, i.currency as Currency);
const lineNet = (i: MailItem) =>
  money(i.unitPriceCents * i.quantity - (i.discountCents ?? 0), i.currency as Currency);

/**
 * R4-SCONTI: `total`/`totalMoney` are the NET total (subtotal − discount), not
 * the gross — the cart's shipping threshold reads the net (D5) and the email
 * must agree with it (`shippingStatus(totalMoney)` below).
 */
function totals(items: MailItem[], locale: "no" | "en") {
  const currency = (items[0]?.currency ?? "NOK") as Currency;
  const lines = items
    .map((i) => {
      const base = `- ${i.quantity}× ${i.productName} [${i.configCode}] — ${formatMoney(
        lineFull(i),
        locale
      )}`;
      return i.discountPct
        ? `${base} → ${formatMoney(lineNet(i), locale)} (-${i.discountPct}%)`
        : base;
    })
    .join("\n");
  const subtotal = sum(items.map(lineFull), currency);
  const discount = money(
    items.reduce((n, i) => n + (i.discountCents ?? 0), 0),
    currency
  );
  const totalMoney = subtract(subtotal, discount);
  return { lines, subtotal, discount, total: formatMoney(totalMoney, locale), totalMoney };
}

/**
 * Shared email-safe shell: a centred card with an accent header bar and a
 * muted footer. Colours come straight from the theme tokens as inline hex.
 */
export function shell(
  theme: ThemeTokens,
  opts: {
    preheader: string;
    heading: string;
    bodyHtml: string;
    /** Absolute URL of the white logo; falls back to the text wordmark. */
    logoUrl?: string;
    /** Extra HTML appended in the footer (e.g. the legal/policy line). */
    footerExtraHtml?: string;
  }
): string {
  const { light, dark, accent } = theme;
  const header = opts.logoUrl
    ? `<img src="${esc(
        opts.logoUrl
      )}" width="170" alt="Min Keramikk" style="display:block;border:0;outline:none;height:auto;width:170px;max-width:170px;">`
    : "Min&nbsp;Keramikk";
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${esc(light)};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(
    opts.preheader
  )}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${esc(
    light
  )};padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${esc(
      light
    )};">
      <tr><td style="background:${esc(
        accent
      )};padding:18px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;letter-spacing:.04em;color:#ffffff;">${header}</td></tr>
      <tr><td style="padding:28px;font-family:Helvetica,Arial,sans-serif;color:${esc(
        dark
      )};font-size:15px;line-height:1.55;">
        <h1 style="margin:0 0 16px;font-size:21px;color:${esc(dark)};">${esc(
          opts.heading
        )}</h1>
        ${opts.bodyHtml}
      </td></tr>
      <tr><td style="padding:16px 28px;background:${esc(
        light
      )};font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${esc(
        dark
      )};">
        <div style="opacity:.65;">Min Keramikk · minkeramikk.no</div>
        ${opts.footerExtraHtml ?? ""}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Order-lines table (shared by customer + admin), prices included. */
function itemsTable(items: MailItem[], theme: ThemeTokens, locale: "no" | "en") {
  const noteLabel = COPY[locale].noteLabel;
  const textLabel = COPY[locale].textLabel;
  const rows = items
    .map(
      (i) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid ${esc(
        theme.light
      )};font-size:14px;">${i.quantity}× ${esc(i.productName)}<br>
        <span style="font-family:monospace;font-size:12px;opacity:.6;">${esc(
          i.configCode
        )}</span>${
          i.customNote
            ? `<br><span style="font-size:12px;opacity:.75;">${esc(
                noteLabel
              )}: ${esc(i.customNote)}</span>`
            : ""
        }${
          i.customText
            ? `<br><span style="font-size:12px;font-weight:600;opacity:.85;">${esc(
                textLabel
              )}: «${esc(i.customText)}»</span>`
            : ""
        }</td>
      <td style="padding:8px 0;border-bottom:1px solid ${esc(
        theme.light
      )};font-size:14px;text-align:right;white-space:nowrap;">${
        i.discountPct
          ? `<s style="opacity:.55;font-size:12px;">${esc(
              formatMoney(lineFull(i), locale)
            )}</s><br>${esc(formatMoney(lineNet(i), locale))} <span style="color:${DISCOUNT_HEX};font-weight:600;">−${i.discountPct}%</span>`
          : esc(formatMoney(lineFull(i), locale))
      }</td></tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0;">${rows}</table>`;
}

/**
 * R4-SCONTI: the darkened `--discount` token (`globals.css`), inlined as a
 * literal hex. Email HTML is the one place "no hardcoded colours" (ADR 0008)
 * yields to the medium: Gmail/Outlook strip <style> and never resolve
 * `var()` or `color-mix()`, so every theme colour in this file already
 * arrives as inline hex (see the `ThemeTokens` param) — this one just isn't
 * themeable, since it isn't a `settings` token to begin with.
 *
 * Derivation: NOT the `color-mix(in oklab, var(--discount), black 34%)` the
 * on-page discount badges use (that formula yields `#455c3c`, noticeably
 * darker) — this value is roughly `color-mix(in oklab, var(--discount),
 * black 18%)` of `--discount: #7da46f`. Re-derive from that ratio, not 34%,
 * on a brand change.
 */
const DISCOUNT_HEX = "#5d7d52";

/**
 * R4-MAIL-JOURNEY: the journey copy for the emails. Word for word the same
 * sentences as `order.steps.*` in the next-intl dictionaries — the page
 * resolves those keys, the mails resolve these, because a mail renders outside
 * a request context (same reason `COPY` above exists at all).
 * TODO:nb-review — Norwegian from mockup-mail-stepper.html, client's eye wanted.
 */
const JOURNEY_COPY = {
  no: {
    title: "Hvor bestillingen din står",
    asOf: "Status",
    now: "nå",
    locale: "nb-NO",
    steps: {
      received: { title: "Bestillingen er mottatt", desc: "Kvitteringen ligger i innboksen din." },
      paid: { title: "Betalingen er registrert", desc: "Vi har mottatt betalingen din." },
      production: { title: "Keramikken lages for hånd", desc: "Håndmalt hos keramikerne våre i Italia." },
      shipped: { title: "Sendt med forsikret frakt", desc: "Du får sporingsnummer på e-post." },
    },
  },
  en: {
    title: "Where your order stands",
    asOf: "Status",
    now: "now",
    locale: "en-GB",
    steps: {
      received: { title: "Order received", desc: "Your receipt is in your inbox." },
      paid: { title: "Payment registered", desc: "We have received your payment." },
      production: { title: "Your ceramics are being made", desc: "Hand-painted by our ceramicists in Italy." },
      shipped: { title: "Shipped, fully insured", desc: "You will get a tracking number by email." },
    },
  },
} as const;

/** "1. september 2026" / "1 September 2026" — the day the mail was written. */
function journeyDate(locale: "no" | "en", at: Date): string {
  return new Intl.DateTimeFormat(JOURNEY_COPY[locale].locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(at);
}

/**
 * The order journey, email-safe (R4-MAIL-JOURNEY §B). NOT the page component:
 * that one draws its rail with absolute positioning and Tailwind classes, and
 * neither exists in Outlook. Shared with the page is the DATA (order-journey.ts),
 * never the markup.
 *
 * Dots, ticks and rail are characters, borders and backgrounds — ZERO images:
 * most mail clients block remote images and this list has to read anyway.
 * Colours are hex literals for the same reason `DISCOUNT_HEX` is.
 *
 * Two accepted degradations, both deliberate:
 *  - old Outlook ignores `border-radius`, so the dots render square. Fine: the
 *    tick and the text still say everything.
 *  - the rail under each dot is a fixed 13px stub, not a line stretched to the
 *    row's height: stretching it needs absolute positioning, which email HTML
 *    does not have. On a two-line step the stub stops short — accepted.
 *
 * `current` is the index from `currentStep()`; every step up to it is done, the
 * one AT it is the last thing that happened and carries the "· nå" marker.
 */
export function journeyHtml(
  theme: ThemeTokens,
  locale: "no" | "en",
  current: number,
  at: Date
): string {
  const c = JOURNEY_COPY[locale];
  const rows = JOURNEY_STEPS.map((key, i) => {
    const s = c.steps[key];
    const done = i <= current;
    const isNow = i === current;
    const dot = done
      ? `background:${DISCOUNT_HEX};border:2px solid ${DISCOUNT_HEX};color:#ffffff;`
      : `background:#ffffff;border:2px solid ${esc(theme.light)};color:#ffffff;`;
    const rail =
      i < JOURNEY_STEPS.length - 1
        ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td width="2" height="13" style="width:2px;height:13px;background:${esc(
            theme.light
          )};font-size:0;line-height:0;">&nbsp;</td></tr></table>`
        : "";
    return `<tr>
      <td width="20" valign="top" style="width:20px;padding:0 11px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="20" style="width:20px;"><tr>
          <td align="center" width="20" height="20" style="width:20px;height:20px;border-radius:50%;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:20px;${dot}">${
            done ? "&#10003;" : "&nbsp;"
          }</td></tr></table>${rail}
      </td>
      <td valign="top" style="padding-bottom:13px;font-family:Helvetica,Arial,sans-serif;">
        <div style="font-size:13px;font-weight:${done ? "bold" : "normal"};color:${esc(
          theme.dark
        )};">${esc(s.title)}${
          isNow
            ? ` <span style="color:${esc(theme.accent)};font-weight:bold;">· ${esc(c.now)}</span>`
            : ""
        }</div>
        <div style="font-size:12px;color:${esc(theme.dark)};opacity:.7;">${esc(s.desc)}</div>
      </td></tr>`;
  }).join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 6px;border:1px solid ${esc(
    theme.light
  )};border-radius:10px;"><tr><td style="padding:15px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;color:${esc(
        theme.dark
      )};">${esc(c.title)}</td>
      <td align="right" style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:${esc(
        theme.dark
      )};opacity:.65;white-space:nowrap;">${esc(c.asOf)} ${esc(journeyDate(locale, at))}</td>
    </tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">${rows}</table>
  </td></tr></table>`;
}

/** Plain-text twin: the text/plain part must carry the journey too. */
export function journeyText(
  locale: "no" | "en",
  current: number,
  at: Date
): string {
  const c = JOURNEY_COPY[locale];
  const lines = JOURNEY_STEPS.map((key, i) => {
    const s = c.steps[key];
    const box = i <= current ? "[x]" : "[ ]";
    const now = i === current ? ` · ${c.now}` : "";
    return `${box} ${s.title}${now} — ${s.desc}`;
  });
  return `\n${c.title} (${c.asOf} ${journeyDate(locale, at)})\n${lines.join("\n")}\n`;
}

/**
 * R4-TAKK-MAIL: the `--warn` box of the thank-you page (`--warn: #b26a00`,
 * DESIGN-SYSTEM §2.1 / §2.2), inlined as literal hex for exactly the reason
 * DISCOUNT_HEX above is: mail clients strip <style> and resolve neither
 * `var()` nor `color-mix()`, so the four tints the page mixes at render time
 * have to be written out here by hand.
 *
 * Derivation — the page's own ratios, `color-mix(in oklab, ...)` of
 * `var(--warn)`: 12% on white (background), 34% on white (border), `black 30%`
 * (text), 46% on white (the dashed chip). Re-derive from those same ratios if
 * `--warn` ever changes; do not eyeball a replacement.
 */
const WARN_BG = "#f7ede4";
const WARN_BORDER = "#e7ccb3";
const WARN_TEXT = "#6d3f00";
const WARN_DASH = "#deba99";

const COPY = {
  no: {
    customerSubject: (c: string) => `Din bestilling ${c} — Min Keramikk`,
    greeting: (n: string) => `Hei ${n},`,
    thanks: "Takk for bestillingen din!",
    codeLabel: "Bestillingskode",
    // R4-TAKK-MAIL · word-for-word the copy already approved on the thank-you
    // page (`order.payment.*` in no.json): same promise, same wording.
    payTitle: "Slik betaler du", // TODO:nb-review
    payLead:
      "Du betaler beløpet over med Vipps — her er detaljene du trenger. Designet bekrefter vi med deg etterpå.", // TODO:nb-review
    payNumberLabel: "Vippsnummer", // TODO:nb-review
    payRecipient: "Min Keramikk AS",
    payQrAlt: "Vipps QR-kode", // TODO:nb-review
    payWarningLabel: "Viktig:", // TODO:nb-review
    payWarning:
      "skriv bestillingsnummeret i meldingsfeltet i Vipps, ellers finner vi ikke betalingen din.", // TODO:nb-review
    // Not on the page (there the chip sits under the warning and needs no
    // label); the plain-text part has no layout, so the line needs naming.
    payMeldingLabel: "Melding i Vipps", // TODO:nb-review
    custom:
      "Dette er en spesialbestilling — vi tar kontakt for å bekrefte designet før noe skal betales.",
    reopen: "Åpne settet ditt på nytt",
    totalLabel: "Totalt",
    // R3-B4 · TODO:alessio-review — provisional wording, same source as cart.insurance.*
    shippingLabel: "Frakt med forsikring",
    shippingIncluded: "Inkludert",
    shippingToBeConfirmed: "Beregnes",
    discountLabel: "Mengderabatt", // TODO:nb-review
    // R4-SCONTI · same sentence as cart.discount.note
    indicative:
      "Rabatten er veiledende — vi bekrefter endelig pris sammen med bestillingen.", // TODO:nb-review
    noteLabel: "Din beskjed til verkstedet", // TODO:nb-review
    textLabel: "Tekst på keramikken", // TODO:nb-review
    legalIntro:
      "For mer om salgsvilkår og personvern — inkludert hvordan vi behandler personopplysninger — se våre",
    legalTerms: "salgsvilkår",
    legalPrivacy: "personvernerklæring",
    legalAnd: "og",
  },
  en: {
    customerSubject: (c: string) => `Your order ${c} — Min Keramikk`,
    greeting: (n: string) => `Hi ${n},`,
    thanks: "Thank you for your order!",
    codeLabel: "Order code",
    payTitle: "How to pay",
    payLead:
      "You pay the amount above with Vipps — here are the details you need. We will confirm the design with you afterwards.",
    payNumberLabel: "Vipps number",
    payRecipient: "Min Keramikk AS",
    payQrAlt: "Vipps QR code",
    payWarningLabel: "Important:",
    payWarning:
      "write the order number in the message field in Vipps, otherwise we cannot match your payment.",
    payMeldingLabel: "Message in Vipps",
    custom:
      "This is a custom order — we'll get in touch to confirm the design before anything is paid.",
    reopen: "Reopen your set",
    totalLabel: "Total",
    shippingLabel: "Insured shipping",
    shippingIncluded: "Included",
    shippingToBeConfirmed: "To be confirmed",
    discountLabel: "Quantity discount",
    // R4-SCONTI · same sentence as cart.discount.note
    indicative:
      "Discounts shown are indicative — we confirm the final price with your order.",
    noteLabel: "Your note to the workshop",
    textLabel: "Inscription on the ceramic",
    legalIntro:
      "For more on our sales terms and privacy — including how we handle your personal data — see our",
    legalTerms: "Terms of Sale",
    legalPrivacy: "Privacy Policy",
    legalAnd: "and",
  },
} as const;

type Copy = (typeof COPY)[keyof typeof COPY];

/**
 * R4-TAKK-MAIL: the payment block, the mail half of the thank-you page's «Slik
 * betaler du». The page promises «you will shortly get an email with your
 * receipt AND the payment details» — this is those details.
 *
 * The hierarchy is DELIBERATELY THE OPPOSITE of the page's: many mail clients
 * block remote images by default, so the QR is the secondary variant here and
 * the NUMBER carries the block. Number, recipient and the melding warning are
 * text — never baked into the image, never conditional on it — so the mail
 * stays payable with images turned off. Keep it that way.
 *
 * Degrades exactly like the page: `hasVippsDetails` false → nothing is
 * rendered and the mail still reads as a complete receipt.
 */
function paymentHtml(
  vipps: VippsSettings,
  code: string,
  theme: ThemeTokens,
  c: Copy
): string {
  const numberCell = `<td valign="top" style="font-family:Helvetica,Arial,sans-serif;">${
    vipps.number
      ? `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.6;">${esc(
          c.payNumberLabel
        )}</div>
        <div style="font-size:26px;font-weight:bold;line-height:1.2;color:${esc(
          theme.dark
        )};">${esc(vipps.number)}</div>`
      : ""
  }<div style="font-size:12px;opacity:.7;padding-top:2px;">${esc(
    c.payRecipient
  )}</div></td>`;
  // Fixed width/height: a blocked image must leave a predictable hole, not
  // collapse the two-column row onto itself.
  const qrCell = vipps.qrImage
    ? `<td valign="top" align="right" width="104" style="width:104px;"><img src="${esc(
        assetUrl(vipps.qrImage)
      )}" width="104" height="104" alt="${esc(
        c.payQrAlt
      )}" style="display:block;border:1px solid ${esc(
        theme.light
      )};border-radius:8px;background:#ffffff;width:104px;height:104px;"></td>`
    : "";
  return `<div style="margin:18px 0;padding:16px;background:${esc(
    theme.light
  )};border-radius:10px;">
    <div style="font-size:15px;font-weight:bold;">${esc(c.payTitle)}</div>
    <p style="margin:4px 0 0;font-size:12px;line-height:1.5;opacity:.75;">${esc(
      c.payLead
    )}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;"><tr>${numberCell}${qrCell}</tr></table>
    <div style="margin-top:14px;padding:12px 14px;background:${WARN_BG};border:1px solid ${WARN_BORDER};border-radius:8px;">
      <p style="margin:0;font-size:12px;line-height:1.5;color:${WARN_TEXT};"><b>${esc(
        c.payWarningLabel
      )}</b> ${esc(c.payWarning)}</p>
      <div style="margin-top:8px;"><span style="display:inline-block;padding:3px 10px;background:#ffffff;border:1px dashed ${WARN_DASH};border-radius:4px;font-family:monospace;font-size:14px;font-weight:bold;color:${esc(
        theme.dark
      )};">${esc(code)}</span></div>
    </div>
  </div>`;
}

/** Plain-text twin of `paymentHtml` — the text/plain part must be payable too. */
function paymentText(vipps: VippsSettings, code: string, c: Copy): string {
  return (
    `\n${c.payTitle}\n${c.payLead}\n` +
    (vipps.number ? `${c.payNumberLabel}: ${vipps.number}\n` : "") +
    `${c.payRecipient}\n` +
    `${c.payWarningLabel} ${c.payWarning}\n${c.payMeldingLabel}: ${code}\n`
  );
}

/** Customer confirmation, in their locale, with the CA-3 reopen-set link. */
export function customerEmail(params: {
  name: string;
  code: string;
  locale: "no" | "en";
  items: MailItem[];
  setUrl: string | null;
  theme: ThemeTokens;
  /** Absolute site origin (siteUrl()): enables the logo + policy links. */
  baseUrl?: string;
  /** R4-TAKK-MAIL: Vipps details, read server-side by the caller (email.ts).
   *  Absent/empty → the payment block is simply not rendered. */
  vipps?: VippsSettings;
  /** R4-MAIL-JOURNEY: the moment the mail is written — the journey block is a
   *  snapshot and says so ("Status 1. september"). Injected so tests are
   *  deterministic; defaults to now. */
  journeyAt?: Date;
}): RenderedEmail {
  const c = COPY[params.locale];
  // A freshly created order is on the first step by definition: it has just
  // been received. No status is read here — this mail IS the receipt.
  const at = params.journeyAt ?? new Date();
  // Null unless there is something to show: the block is all-or-nothing.
  const vipps = params.vipps && hasVippsDetails(params.vipps) ? params.vipps : null;
  const legalHtml = params.baseUrl
    ? `<div style="margin-top:10px;opacity:.7;line-height:1.5;">${esc(
        c.legalIntro
      )} <a href="${esc(
        `${params.baseUrl}/${params.locale}/terms`
      )}" style="color:${esc(params.theme.accent)};">${esc(
        c.legalTerms
      )}</a> ${esc(c.legalAnd)} <a href="${esc(
        `${params.baseUrl}/${params.locale}/privacy`
      )}" style="color:${esc(params.theme.accent)};">${esc(
        c.legalPrivacy
      )}</a>.</div>`
    : undefined;
  const { lines, total, totalMoney, discount } = totals(params.items, params.locale);
  const discounted = discount.amountCents > 0;
  // R3-B4/R4-SCONTI: the shipping entry travels in the recap too — textual
  // status only, no new arithmetic (the shop confirms the shipping cost by
  // hand). `totalMoney` is the NET total (D5), so this agrees with the cart.
  const shippingValue = shippingStatus(totalMoney).included
    ? c.shippingIncluded
    : c.shippingToBeConfirmed;
  const text =
    `${c.greeting(params.name)}\n\n${c.thanks} ${c.codeLabel}: ${params.code}.\n` +
    (vipps ? paymentText(vipps, params.code, c) : "") +
    journeyText(params.locale, 0, at) +
    `\n${lines}\n\n` +
    (discounted ? `${c.discountLabel}: -${formatMoney(discount, params.locale)}\n` : "") +
    `${c.shippingLabel}: ${shippingValue}\n${c.totalLabel}: ${total}\n\n${c.custom}\n` +
    (discounted ? `${c.indicative}\n` : "") +
    (params.setUrl ? `\n${c.reopen}: ${params.setUrl}\n` : "") +
    `\nMin Keramikk`;

  const codeBox = `<div style="margin:18px 0;padding:14px;text-align:center;background:${esc(
    params.theme.light
  )};border-radius:10px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.6;">${esc(
      c.codeLabel
    )}</div>
    <div style="font-family:monospace;font-size:26px;font-weight:bold;color:${esc(
      params.theme.accent
    )};margin-top:4px;">${esc(params.code)}</div></div>`;

  const discountRow = discounted
    ? `<tr><td style="padding-top:8px;font-size:13px;opacity:.75;">${esc(
        c.discountLabel
      )}</td><td style="padding-top:8px;font-size:13px;opacity:.75;text-align:right;color:${DISCOUNT_HEX};">−${esc(
        formatMoney(discount, params.locale)
      )}</td></tr>`
    : "";

  const totalRow = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${discountRow}<tr>
    <td style="padding-top:8px;font-size:13px;opacity:.75;">${esc(
      c.shippingLabel
    )}</td>
    <td style="padding-top:8px;font-size:13px;opacity:.75;text-align:right;">${esc(
      shippingValue
    )}</td></tr><tr>
    <td style="padding-top:8px;font-size:15px;font-weight:bold;">${esc(
      c.totalLabel
    )}</td>
    <td style="padding-top:8px;font-size:15px;font-weight:bold;text-align:right;">${esc(
      total
    )}</td></tr></table>`;

  const indicativeNote = discounted
    ? `<p style="margin:8px 0 0;font-size:11px;text-align:center;opacity:.6;">${esc(
        c.indicative
      )}</p>`
    : "";

  const reopenBtn = params.setUrl
    ? `<div style="margin:22px 0 4px;"><a href="${esc(
        params.setUrl
      )}" style="display:inline-block;background:${esc(
        params.theme.accent
      )};color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:12px 22px;border-radius:999px;">${esc(
        c.reopen
      )} →</a></div>`
    : "";

  const bodyHtml = `<p style="margin:0 0 4px;">${esc(c.greeting(params.name))}</p>
    ${codeBox}
    ${vipps ? paymentHtml(vipps, params.code, params.theme, c) : ""}
    ${journeyHtml(params.theme, params.locale, 0, at)}
    ${itemsTable(params.items, params.theme, params.locale)}
    ${totalRow}
    ${indicativeNote}
    <p style="margin:18px 0 0;">${esc(c.custom)}</p>
    ${reopenBtn}`;

  return {
    subject: c.customerSubject(params.code),
    text,
    html: shell(params.theme, {
      preheader: `${c.thanks} ${c.codeLabel}: ${params.code}`,
      heading: c.thanks,
      bodyHtml,
      logoUrl: params.baseUrl ? `${params.baseUrl}/logo-white.png` : undefined,
      footerExtraHtml: legalHtml,
    }),
  };
}

/** Internal notification to the shop owner (English). */
export function adminEmail(params: {
  code: string;
  customerName: string;
  customerEmail: string;
  items: MailItem[];
  theme: ThemeTokens;
  /** R2-6 D: "Replica set" deep-link (configurator step 3) the owner can open
   *  straight from the inbox. Null when no line is replicable. */
  replicaUrl: string | null;
  /** Absolute site origin (siteUrl()): enables the header logo. */
  baseUrl?: string;
}): RenderedEmail {
  const { lines, total } = totals(params.items, "en");
  const text =
    `Order ${params.code} from ${params.customerName} <${params.customerEmail}>\n\n${lines}\n\nTotal: ${total}` +
    (params.replicaUrl ? `\n\nReplica set: ${params.replicaUrl}` : "");
  const replicaBtn = params.replicaUrl
    ? `<div style="margin:18px 0 4px;"><a href="${esc(
        params.replicaUrl
      )}" style="display:inline-block;background:${esc(
        params.theme.accent
      )};color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:10px 20px;border-radius:999px;">Replica set →</a></div>`
    : "";
  const bodyHtml = `<p style="margin:0 0 8px;">New order <strong>${esc(
    params.code
  )}</strong> from ${esc(params.customerName)}
    &lt;<a href="mailto:${esc(params.customerEmail)}" style="color:${esc(
      params.theme.accent
    )};">${esc(params.customerEmail)}</a>&gt;</p>
    ${itemsTable(params.items, params.theme, "en")}
    <p style="margin:8px 0 0;font-weight:bold;">Total: ${esc(total)}</p>
    ${replicaBtn}`;
  return {
    subject: `New order ${params.code} (${params.customerName})`,
    text,
    html: shell(params.theme, {
      preheader: `New order ${params.code}`,
      heading: `New order ${params.code}`,
      bodyHtml,
      logoUrl: params.baseUrl ? `${params.baseUrl}/logo-white.png` : undefined,
    }),
  };
}

/** Supplier production-order cover (English) — the PDF is attached separately. */
export function supplierEmail(params: {
  orderCode: string;
  supplierName: string;
  theme: ThemeTokens;
}): RenderedEmail {
  const text =
    `Hi ${params.supplierName},\n\n` +
    `Attached is the production order ${params.orderCode}. ` +
    `Please see the specification (designs, colours and quantities) in the PDF.\n\n` +
    `Min Keramikk`;
  const bodyHtml = `<p style="margin:0 0 8px;">Hi ${esc(params.supplierName)},</p>
    <p style="margin:0 0 8px;">Attached is the production order <strong>${esc(
      params.orderCode
    )}</strong>. Please see the specification (designs, colours and quantities) in the PDF.</p>`;
  return {
    subject: `Production order ${params.orderCode} — ${params.supplierName}`,
    text,
    html: shell(params.theme, {
      preheader: `Production order ${params.orderCode}`,
      heading: `Production order ${params.orderCode}`,
      bodyHtml,
    }),
  };
}
