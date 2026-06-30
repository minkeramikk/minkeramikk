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
import { formatMoney, money, type Currency } from "@/lib/money/money";
import type { ThemeTokens } from "@/lib/theme";

export interface MailItem {
  productName: string;
  quantity: number;
  unitPriceCents: number;
  currency: string;
  configCode: string;
  /** R2-2b: customer colour note. Rendered escaped; only when non-empty. */
  customNote?: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function totals(items: MailItem[], locale: "no" | "en") {
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

/**
 * Shared email-safe shell: a centred card with an accent header bar and a
 * muted footer. Colours come straight from the theme tokens as inline hex.
 */
function shell(
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
        }</td>
      <td style="padding:8px 0;border-bottom:1px solid ${esc(
        theme.light
      )};font-size:14px;text-align:right;white-space:nowrap;">${esc(
        formatMoney(
          money(i.unitPriceCents * i.quantity, i.currency as Currency),
          locale
        )
      )}</td></tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0;">${rows}</table>`;
}

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
    noteLabel: "Din beskjed til verkstedet", // TODO:nb-review
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
    noteLabel: "Your note to the workshop",
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
  const { lines, total } = totals(params.items, params.locale);
  const text =
    `${c.greeting(params.name)}\n\n${c.thanks} ${c.codeLabel}: ${params.code}.\n\n` +
    `${lines}\n\n${c.totalLabel}: ${total}\n\n${c.custom}\n` +
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

  const totalRow = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-top:8px;font-size:15px;font-weight:bold;">${esc(
      c.totalLabel
    )}</td>
    <td style="padding-top:8px;font-size:15px;font-weight:bold;text-align:right;">${esc(
      total
    )}</td></tr></table>`;

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
