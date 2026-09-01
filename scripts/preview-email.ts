/**
 * Anteprima locale della mail cliente (R4-TAKK-MAIL) — TOOLING, non un test.
 *
 * Renderizza `customerEmail()` nei tre stati Vipps × NO/EN e scrive gli .html
 * in docs/evidence/r4-takk-mail/, più un .txt della versione plain-text.
 * `email-html.ts` è puro: nessun DB, nessuna mail spedita.
 *
 *   npx tsx scripts/preview-email.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { customerEmail, type MailItem } from "../src/lib/orders/email-html";
import { DEFAULT_THEME } from "../src/lib/theme";
import { NO_VIPPS, type VippsSettings } from "../src/lib/orders/vipps";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://rqhsbpwvzesvqwdonirf.supabase.co";

const OUT = "docs/evidence/r4-takk-mail";
mkdirSync(OUT, { recursive: true });

const items: MailItem[] = [
  { productName: "Dyp tallerken", quantity: 6, unitPriceCents: 34_000, currency: "NOK",
    configCode: "AMALFI-DYR-01", discountPct: 8, discountCents: 16_320 },
  { productName: "Flat tallerken", quantity: 2, unitPriceCents: 29_000, currency: "NOK",
    configCode: "AMALFI-DYR-02", customText: "Til Kari & Ola" },
];

const FULL: VippsSettings = {
  qrImage: "settings/vipps-qr.png",
  number: "654321",
  link: "https://qr.vipps.no/vp/HTCB4pJcp",
};
const QR_ONLY: VippsSettings = { ...FULL, number: null };

const STATES = { full: FULL, "qr-only": QR_ONLY, none: NO_VIPPS };

for (const [state, vipps] of Object.entries(STATES)) {
  for (const locale of ["no", "en"] as const) {
    const mail = customerEmail({
      name: "Kari Nordmann",
      code: "MK-2026-0042",
      locale,
      items,
      setUrl: "https://minkeramikk.no/no/configurator?step=3&set=demo",
      theme: DEFAULT_THEME,
      baseUrl: "https://minkeramikk.no",
      vipps,
    } as Parameters<typeof customerEmail>[0]);
    writeFileSync(`${OUT}/mail-${state}-${locale}.html`, mail.html);
    writeFileSync(`${OUT}/mail-${state}-${locale}.txt`, mail.text);
    console.log(`${OUT}/mail-${state}-${locale}.html`);
  }
}
