import { formatMoney, money, multiply } from "@/lib/money/money";
import { shippingStatus } from "@/lib/cart/shipping";
import { hasVippsDetails, type VippsSettings } from "./vipps";
import type { OrderItemInput } from "./schema";
import type { CartDiscount } from "@/lib/discounts/discount";

/**
 * R4-PDF-CLIENTE — il contenuto del riepilogo per il CLIENTE, puro.
 *
 * Nessun React, nessun DB, nessun `server-only`: qui si decide COSA c'è nel
 * documento e come si legge; il disegno sta in `customer-pdf.tsx` e la
 * generazione in `customer-pdf.server.tsx`.
 *
 * Ciò che entra viene tutto dall'ordine appena creato: le scelte del design
 * stanno già nello snapshot di riga (`configSnapshot.selections`), quindi per i
 * TESTI non serve leggere il catalogo — solo l'immagine composita ha bisogno
 * dello Storage, e vive altrove.
 *
 * La lista FUORI (card §Cosa) non passa mai di qui: fornitore, sue email, note
 * interne e pesi non entrano nemmeno nell'input. I contatti PUBBLICI del negozio
 * invece ci sono, ed è la card a volerli.
 *
 * TODO:nb-review NO copy: l'intera COPY qui sotto.
 */

export interface CustomerPdfLabels {
  title: string;
  orderNumber: string;
  date: string;
  design: string;
  inscription: string;
  colourNote: string;
  product: string;
  qty: string;
  unitPrice: string;
  lineTotal: string;
  subtotal: string;
  discount: string;
  total: string;
  shippingIncluded: string;
  shippingToBeConfirmed: string;
  shipTo: string;
  payTitle: string;
  payNumberLabel: string;
  payQrLabel: string;
  contact: string;
}

const COPY: Record<"no" | "en", CustomerPdfLabels> = {
  no: {
    title: "Oppsummering av bestillingen",
    orderNumber: "Bestillingsnummer",
    date: "Dato",
    design: "Ditt design",
    inscription: "Tekst på keramikken",
    colourNote: "Fargenotat",
    product: "Produkt",
    qty: "Antall",
    unitPrice: "Pris",
    lineTotal: "Sum",
    subtotal: "Delsum",
    discount: "Rabatt",
    total: "Totalt",
    shippingIncluded: "Frakt og forsikring inkludert",
    shippingToBeConfirmed: "Frakt bekreftes senere",
    shipTo: "Leveres til",
    payTitle: "Slik betaler du",
    payNumberLabel: "Vippsnummer",
    payQrLabel: "Skann med Vipps",
    contact: "Min Keramikk · minkeramikk.no",
  },
  en: {
    title: "Order summary",
    orderNumber: "Order number",
    date: "Date",
    design: "Your design",
    inscription: "Text on the ceramic",
    colourNote: "Colour note",
    product: "Product",
    qty: "Qty",
    unitPrice: "Price",
    lineTotal: "Sum",
    subtotal: "Subtotal",
    discount: "Discount",
    total: "Total",
    shippingIncluded: "Shipping and insurance included",
    shippingToBeConfirmed: "Shipping confirmed later",
    shipTo: "Ship to",
    payTitle: "How to pay",
    payNumberLabel: "Vipps number",
    payQrLabel: "Scan with Vipps",
    contact: "Min Keramikk · minkeramikk.no",
  },
};

/** L'istruzione che è il motivo per cui il PDF esiste: senza il numero d'ordine
 *  nel campo melding la bonifica del pagamento non si aggancia a niente. */
const melding = (locale: "no" | "en", code: string) =>
  locale === "no"
    ? `Skriv bestillingsnummeret ${code} i meldingsfeltet i Vipps — ellers finner vi ikke betalingen din.`
    : `Write the order number ${code} in the Vipps message field — otherwise we cannot match your payment.`;

export interface CustomerPdfDoc {
  orderCode: string;
  date: string;
  locale: "no" | "en";
  design: { name: string; selections: { label: string; option: string }[] } | null;
  customText: string | null;
  customNote: string | null;
  items: { productName: string; quantity: number; unitPrice: string; lineTotal: string }[];
  subtotal: string;
  /** Assente quando è zero: una riga «Rabatt 0 kr» è rumore. */
  discount: string | null;
  total: string;
  shippingIncluded: boolean;
  shipTo: {
    name: string;
    address: string | null;
    zipcode: string | null;
    city: string | null;
    country: string | null;
  } | null;
  /** Null ⇒ il blocco pagamento non si disegna e il documento resta completo. */
  payment: { number: string | null; showQr: boolean; melding: string } | null;
  labels: CustomerPdfLabels;
}

export interface CustomerPdfInput {
  code: string;
  customerName: string;
  locale: "no" | "en";
  items: OrderItemInput[];
  discount: CartDiscount;
  address: {
    address?: string;
    zipcode?: string;
    city?: string;
    country?: string;
  };
  vipps: VippsSettings;
  now?: Date;
}

/**
 * La data, in ora di OSLO.
 *
 * Il PDF si renderizza sul server, e su Vercel il server è in UTC: senza il pin
 * un ordine delle 00:30 norvegesi porterebbe la data del giorno prima. Stessa
 * lezione già applicata all'activity log di R4-ORDERS-PLUS.
 */
function formatDate(d: Date, locale: "no" | "en"): string {
  return d.toLocaleDateString(locale === "no" ? "nb-NO" : "en-GB", {
    timeZone: "Europe/Oslo",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function buildCustomerPdfDoc(input: CustomerPdfInput): CustomerPdfDoc {
  const { code, locale, items, discount } = input;
  const labels = COPY[locale];
  const currency = items[0]?.currency ?? "NOK";

  // Il design è UNO per ordine (il configuratore ne congela uno): si prende dal
  // primo snapshot che ce l'ha, e le scelte portano il NOME del colore — l'hex
  // è dato di rendering, non informazione per il cliente.
  const snap = items.find((i) => i.configSnapshot)?.configSnapshot as
    | {
        designName?: string;
        designNameNo?: string;
        designNameEn?: string;
        selections?: { label: string; option: string; hex: string | null }[];
        customNote?: string;
        customText?: string;
      }
    | undefined;
  const designName =
    (locale === "no" ? snap?.designNameNo : snap?.designNameEn) ?? snap?.designName ?? null;

  const rows = items.map((i, idx) => {
    const unit = money(i.unitPriceCents, i.currency);
    const line = discount.perLine[String(idx)];
    return {
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: formatMoney(unit, locale),
      // Il netto della riga viene dal motore sconti, mai ricalcolato qui.
      lineTotal: formatMoney(line?.net ?? multiply(unit, i.quantity), locale),
    };
  });

  const savedCents = discount.subtotal.amountCents - discount.total.amountCents;
  const addr = input.address;
  const hasAddress = Boolean(addr.address || addr.zipcode || addr.city || addr.country);

  return {
    orderCode: code,
    date: formatDate(input.now ?? new Date(), locale),
    locale,
    design: designName
      ? {
          name: designName,
          selections: (snap?.selections ?? []).map((s) => ({
            label: s.label,
            option: s.option,
          })),
        }
      : null,
    customText: snap?.customText || null,
    customNote: snap?.customNote || null,
    items: rows,
    subtotal: formatMoney(discount.subtotal, locale),
    discount: savedCents > 0 ? formatMoney(money(savedCents, currency), locale) : null,
    total: formatMoney(discount.total, locale),
    shippingIncluded: shippingStatus(discount.total).included,
    shipTo: hasAddress
      ? {
          name: input.customerName,
          address: addr.address || null,
          zipcode: addr.zipcode || null,
          city: addr.city || null,
          country: addr.country || null,
        }
      : null,
    payment: hasVippsDetails(input.vipps)
      ? {
          number: input.vipps.number,
          showQr: Boolean(input.vipps.qrImage),
          melding: melding(locale, code),
        }
      : null,
    labels,
  };
}
