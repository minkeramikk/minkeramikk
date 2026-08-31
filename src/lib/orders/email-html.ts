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

const COPY = {
  no: {
    customerSubject: (c: string) => `Din bestilling ${c} — Min Keramikk`,
    greeting: (n: string) => `Hei ${n},`,
    thanks: "Takk for bestillingen din!",
    codeLabel: "Bestillingskode",
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
}): RenderedEmail {
  const c = COPY[params.locale];
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
    `${c.greeting(params.name)}\n\n${c.thanks} ${c.codeLabel}: ${params.code}.\n\n` +
    `${lines}\n\n` +
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
