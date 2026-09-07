/**
 * Anteprima locale delle mail cliente (R4-MAIL-JOURNEY) — TOOLING, non un test.
 *
 * Renderizza le QUATTRO mail del percorso (conferma · pagamento registrato · in
 * produzione · spedita) in NO ed EN e le scrive in docs/evidence/r4-mail-copy/,
 * più il .txt della versione plain-text. I renderer sono puri: nessuna mail parte.
 *
 * R4-MAIL-COPY: il nome di prova è scritto in minuscolo apposta — è il difetto
 * che la card Ⓐ risolve, e l'anteprima deve mostrarlo risolto.
 *
 * I token del tema sono quelli VERI del negozio, letti da `settings`: la card lo
 * chiede esplicitamente, un'evidenza in viola di default non prova niente.
 *
 *   npx tsx --env-file=.env.local scripts/preview-email.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { customerEmail, type MailItem } from "../src/lib/orders/email-html";
import { statusEmail } from "../src/lib/orders/status-email";
import { DEFAULT_THEME, type ThemeTokens } from "../src/lib/theme";
import { NO_VIPPS, type VippsSettings } from "../src/lib/orders/vipps";

const OUT = "docs/evidence/r4-mail-copy";
mkdirSync(OUT, { recursive: true });

/** The real tokens, or a LOUD failure — silent DEFAULT_THEME evidence is worse
 *  than no evidence: it looks like the shop's mails are purple. */
async function shopTheme(): Promise<ThemeTokens> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn(
      "\n⚠️  NEXT_PUBLIC_SUPABASE_URL/ANON_KEY assenti — rilancia con `--env-file=.env.local`.\n" +
        "    L'anteprima uscirebbe in DEFAULT_THEME: NON è evidenza valida.\n"
    );
    return DEFAULT_THEME;
  }
  const { data, error } = await createClient(url, key)
    .from("settings")
    .select("color_light, color_dark, color_accent")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) {
    console.warn(`\n⚠️  settings non leggibile (${error?.message ?? "riga assente"}) — DEFAULT_THEME.\n`);
    return DEFAULT_THEME;
  }
  return { light: data.color_light, dark: data.color_dark, accent: data.color_accent };
}

const items: MailItem[] = [
  { productName: "Dyp tallerken", quantity: 6, unitPriceCents: 34_000, currency: "NOK",
    configCode: "AMALFI-DYR-01", discountPct: 8, discountCents: 16_320 },
  { productName: "Flat tallerken", quantity: 2, unitPriceCents: 29_000, currency: "NOK",
    configCode: "AMALFI-DYR-02", customText: "Til Kari & Ola" },
];

const VIPPS: VippsSettings = {
  qrImage: "settings/vipps-qr.png",
  number: "654321",
  link: "https://qr.vipps.no/vp/HTCB4pJcp",
};

const NAME = "daniele d'angeli";
const CODE = "MK-2302";
const AT = new Date("2026-09-01T10:00:00Z");
const PAID_AT = "2026-09-01T09:00:00Z";

const write = (name: string, mail: { html: string; text: string }) => {
  writeFileSync(`${OUT}/${name}.html`, mail.html);
  writeFileSync(`${OUT}/${name}.txt`, mail.text);
  console.log(`${OUT}/${name}.html`);
};

async function main() {
  const theme = await shopTheme();

  for (const locale of ["no", "en"] as const) {
    // ① conferma d'ordine (con e senza i dati Vipps: il blocco è all-or-nothing)
    write(`1-confirmation-${locale}`, customerEmail({
      name: NAME, code: CODE, locale, items,
      theme, baseUrl: "https://minkeramikk.no", vipps: VIPPS, journeyAt: AT,
    }));
    // R4-FIX Ⓓ: il caso REALE di oggi — QR archiviato, `vipps_number` ancora
    // NULL. È quello in cui la riga a due colonne lasciava il destinatario
    // orfano sul telefono.
    write(`1-confirmation-qr-only-${locale}`, customerEmail({
      name: NAME, code: CODE, locale, items,
      theme, baseUrl: "https://minkeramikk.no",
      vipps: { qrImage: "settings/vipps-qr.png", number: null, link: null },
      journeyAt: AT,
    }));
    write(`1-confirmation-no-vipps-${locale}`, customerEmail({
      name: NAME, code: CODE, locale, items,
      theme, baseUrl: "https://minkeramikk.no", vipps: NO_VIPPS, journeyAt: AT,
    }));

    // ② pagamento registrato (la mail nuova) — stato ancora `new`, paid_at scritto
    write(`2-paid-${locale}`, statusEmail({
      kind: "paid", status: "new", code: CODE, customerName: NAME, locale,
      paidAt: PAID_AT, theme, baseUrl: "https://minkeramikk.no", journeyAt: AT,
    })!);

    // ③ in produzione
    write(`3-production-${locale}`, statusEmail({
      status: "in_production", code: CODE, customerName: NAME, locale,
      paidAt: PAID_AT, theme, baseUrl: "https://minkeramikk.no", journeyAt: AT,
    })!);

    // ④ spedita, col tracking
    write(`4-shipped-${locale}`, statusEmail({
      status: "shipped", code: CODE, customerName: NAME, locale,
      paidAt: PAID_AT, trackingCode: "https://sporing.posten.no/NO123456789",
      theme, baseUrl: "https://minkeramikk.no", journeyAt: AT,
    })!);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
