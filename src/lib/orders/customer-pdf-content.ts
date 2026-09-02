import { formatMoney, money, multiply, subtract, type Money } from "@/lib/money/money";
import { shippingStatus } from "@/lib/cart/shipping";
import { hasVippsDetails, type VippsSettings } from "./vipps";
import type { SellerIdentity } from "./seller";
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
 * ⚠️ L'ordine ha N design, non uno. Il carrello tiene righe di design diversi
 * (`lineKey` = prodotto + configCode), e la prima versione di questo file
 * prendeva design, iscrizione e nota dalla PRIMA riga che li avesse per poi
 * attribuirli a tutto l'ordine: su un ordine misto il PDF mostrava un design
 * solo, e l'iscrizione di quel design compariva come valida anche per gli altri.
 * Da qui `designs: CustomerPdfDesignBlock[]`, ognuno con le SUE righe e i SUOI
 * testi. I totali invece restano UNO SOLO: lo sconto è calcolato sul carrello
 * intero, e un totale per blocco sarebbe una seconda aritmetica da tenere
 * allineata a quella vera.
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
  vatIncluded: string;
  orgNumber: string;
  shippingIncluded: string;
  shippingToBeConfirmed: string;
  shipTo: string;
  payTitle: string;
  payNumberLabel: string;
  payQrLabel: string;
  contact: string;
}

/**
 * L'aliquota MVA ordinaria norvegese. In UN posto solo: la stessa costante
 * nomina l'etichetta e fa lo scorporo, così non possono divergere.
 */
export const MVA_RATE_PCT = 25;

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
    // «Herav», non il solo «MVA»: il totale la contiene già, non la aspetta.
    vatIncluded: `Herav MVA ${MVA_RATE_PCT} %`,
    orgNumber: "Org.nr.",
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
    // "Incl.", not a bare "VAT": the total already contains it.
    vatIncluded: `Incl. VAT ${MVA_RATE_PCT}%`,
    orgNumber: "Org. no.",
    shippingIncluded: "Shipping and insurance included",
    shippingToBeConfirmed: "Shipping confirmed later",
    shipTo: "Ship to",
    payTitle: "How to pay",
    payNumberLabel: "Vipps number",
    payQrLabel: "Scan with Vipps",
    contact: "Min Keramikk · minkeramikk.no",
  },
};

/**
 * La MVA SCORPORATA da un importo che la contiene già.
 *
 * ⚠️ I prezzi di minkeramikk.no sono IVA INCLUSA — i termini di vendita lo
 * dichiarano in entrambe le lingue («alle priser inkluderer toll, MVA og
 * frakt»; §4 EN: the price «INCLUDES Norwegian VAT»). Aggiungere il 25 % sopra
 * farebbe stampare un importo diverso da quello che il cliente sta per pagare
 * su Vipps: il difetto peggiore possibile su questo documento.
 *
 * Il netto NON si arrotonda per conto suo: si sottrae. Due arrotondamenti
 * indipendenti producono righe che non tornano di 1 øre, e il TOTALE è la fonte
 * di verità perché è ciò che si paga. Così `net + vat === total` esattamente,
 * per qualunque importo.
 */
export function splitVatInclusive(total: Money): { vat: Money; net: Money } {
  const vat = money(
    Math.round((total.amountCents * MVA_RATE_PCT) / (100 + MVA_RATE_PCT)),
    total.currency
  );
  return { vat, net: subtract(total, vat) };
}

/** L'istruzione che è il motivo per cui il PDF esiste: senza il numero d'ordine
 *  nel campo melding la bonifica del pagamento non si aggancia a niente. */
const melding = (locale: "no" | "en", code: string) =>
  locale === "no"
    ? `Skriv bestillingsnummeret ${code} i meldingsfeltet i Vipps — ellers finner vi ikke betalingen din.`
    : `Write the order number ${code} in the Vipps message field — otherwise we cannot match your payment.`;

/**
 * Quante anteprime composite il documento può portare al massimo.
 *
 * Il tetto è di COSTO, non di gusto: ogni piatto è un `composePlate` (sharp,
 * più i layer scaricati dallo Storage) dentro `after()`, e i suoi byte finiscono
 * nel PDF — che deve restare sotto i 300 KB per viaggiare come allegato. Oltre
 * il tetto i blocchi restano COMPLETI (nome, scelte, testi, righe): sparisce
 * l'immagine, mai l'informazione.
 */
export const MAX_COMPOSED_PLATES = 4;

/** Una riga prodotto, già formattata. */
export interface CustomerPdfRow {
  productName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

/**
 * UN design dell'ordine, con le SUE righe e i SUOI testi.
 *
 * Il carrello tiene righe di design diversi (`lineKey` = prodotto + configCode),
 * quindi un ordine ha N di questi blocchi, non uno.
 */
export interface CustomerPdfDesignBlock {
  /**
   * Il codice di configurazione: la CHIAVE dell'immagine, perché è esattamente
   * ciò che il compositing decodifica. Null sul blocco di coda, che immagine non
   * ne ha.
   */
  configCode: string | null;
  /** Serve SOLO al compositing lato server; non si stampa mai. Sta qui e non lo
   *  ripesca nessun altro: slug e configCode devono venire dalla STESSA riga. */
  designSlug: string | null;
  /** Null ⇒ blocco senza intestazione (le righe che non portano uno snapshot). */
  name: string | null;
  selections: { label: string; option: string }[];
  customText: string | null;
  customNote: string | null;
  items: CustomerPdfRow[];
  /** Il blocco ha diritto a un'anteprima composita (vedi MAX_COMPOSED_PLATES). */
  showPlate: boolean;
}

export interface CustomerPdfDoc {
  orderCode: string;
  date: string;
  locale: "no" | "en";
  /** In ordine di prima apparizione nel carrello; il blocco senza design, se
   *  c'è, è sempre l'ULTIMO. Vuoto solo per un ordine senza righe. */
  designs: CustomerPdfDesignBlock[];
  subtotal: string;
  /** Assente quando è zero: una riga «Rabatt 0 kr» è rumore. */
  discount: string | null;
  total: string;
  /**
   * La MVA GIÀ CONTENUTA nel totale. Null quando il negozio non è in
   * MVA-registeret — che è il default: stamparla senza esserlo è illegale.
   */
  vatIncluded: string | null;
  shippingIncluded: boolean;
  shipTo: {
    name: string;
    address: string | null;
    zipcode: string | null;
    city: string | null;
    country: string | null;
  } | null;
  /** Null ⇒ il blocco pagamento non si disegna e il documento resta completo. */
  payment: {
    number: string | null;
    showQr: boolean;
    /**
     * L'indirizzo che il QR codifica, stampato in chiaro. Chi apre il PDF SUL
     * TELEFONO non può inquadrare col telefono il QR che quello stesso telefono
     * mostra: il link è l'unico percorso per il caso più probabile.
     */
    link: string | null;
    melding: string;
  } | null;
  /**
   * Il piè di pagina del venditore, già composto riga per riga. Null quando non
   * c'è NIENTE da stampare (lo stato di oggi). DEGRADA PER CAMPO: un campo
   * vuoto si porta via la sua riga — mai un'etichetta senza valore, mai un
   * segnaposto.
   */
  seller: string[] | null;
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
  seller: SellerIdentity;
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
    // Il mese per ESTESO in inglese, non abbreviato: en-GB abbrevia September
    // in «Sept», e «02 Sept 2026» su una ricevuta si legge come un refuso. Il
    // norvegese resta com'è — «28. aug. 2026» è la forma corretta lì.
    ...(locale === "no"
      ? { day: "2-digit" as const, month: "short" as const }
      : { day: "numeric" as const, month: "long" as const }),
    year: "numeric",
  });
}

/**
 * Le righe del venditore, saltando i campi vuoti (card §C).
 *
 * L'organisasjonsnummer porta il suffisso « MVA » SOLO da soggetto registrato:
 * è la dicitura corretta per chi lo è, ed è sbagliata — e illegale — per chi
 * non lo è. Stessa unica verità che governa la riga MVA.
 */
function sellerLines(seller: SellerIdentity, labels: CustomerPdfLabels): string[] {
  const contact = [seller.email, seller.phone].filter(Boolean).join(" · ");
  return [
    seller.name,
    seller.address,
    seller.orgNumber
      ? `${labels.orgNumber} ${seller.orgNumber}${seller.vatRegistered ? " MVA" : ""}`
      : null,
    contact || null,
  ].filter((l): l is string => Boolean(l));
}

/** Lo snapshot di riga, per quel che ne serve al documento. */
interface ItemSnapshot {
  designSlug?: string;
  designName?: string;
  designNameNo?: string;
  designNameEn?: string;
  selections?: { label: string; option: string; hex: string | null }[];
  customNote?: string;
  customText?: string;
}

/**
 * I blocchi design dell'ordine, uno per configurazione DISTINTA.
 *
 * Chiave: il `configCode` — non lo slug del design. Due righe dello stesso
 * design con colori diversi sono due configCode e due piatti VISIBILMENTE
 * diversi: raggrupparle per slug le fonderebbe e ne mostrerebbe uno solo.
 *
 * Nella chiave entrano anche iscrizione e nota, che nel configCode NON viaggiano
 * (ADR 0011: il codice porta design + opzioni, nient'altro). Senza, due righe
 * stessa configurazione e testi diversi finirebbero nello stesso blocco e uno
 * dei due testi verrebbe attribuito anche all'altra riga — lo stesso difetto di
 * attribuzione, in piccolo.
 */
function designBlocks(
  items: OrderItemInput[],
  locale: "no" | "en",
  row: (i: OrderItemInput) => CustomerPdfRow
): CustomerPdfDesignBlock[] {
  const byKey = new Map<string, CustomerPdfDesignBlock>();
  /** Le righe che uno snapshot non ce l'hanno: un blocco solo, in coda, senza
   *  intestazione. Mai attaccate al design di qualcun altro. */
  const orphans: CustomerPdfRow[] = [];

  for (const i of items) {
    const snap = (i.configSnapshot ?? undefined) as ItemSnapshot | undefined;
    // Le scelte portano il NOME del colore — l'hex è dato di rendering, non
    // informazione per il cliente.
    const name =
      (locale === "no" ? snap?.designNameNo : snap?.designNameEn) ?? snap?.designName ?? null;
    if (!name) {
      orphans.push(row(i));
      continue;
    }
    const key = [i.configCode, snap?.customText ?? "", snap?.customNote ?? ""].join(" ");
    let block = byKey.get(key);
    if (!block) {
      block = {
        configCode: i.configCode,
        designSlug: snap?.designSlug ?? null,
        name,
        selections: (snap?.selections ?? []).map((s) => ({ label: s.label, option: s.option })),
        customText: snap?.customText || null,
        customNote: snap?.customNote || null,
        items: [],
        showPlate: false,
      };
      byKey.set(key, block);
    }
    block.items.push(row(i));
  }

  const blocks = [...byKey.values()];
  if (orphans.length > 0) {
    blocks.push({
      configCode: null,
      designSlug: null,
      name: null,
      selections: [],
      customText: null,
      customNote: null,
      items: orphans,
      showPlate: false,
    });
  }

  // Il tetto conta le IMMAGINI, cioè i configCode distinti: due blocchi che
  // differiscono solo per l'iscrizione condividono lo stesso piatto e costano
  // un compositing solo.
  const plated = new Set<string>();
  for (const b of blocks) {
    if (!b.designSlug || !b.configCode) continue;
    if (!plated.has(b.configCode) && plated.size >= MAX_COMPOSED_PLATES) continue;
    plated.add(b.configCode);
    b.showPlate = true;
  }
  return blocks;
}

export function buildCustomerPdfDoc(input: CustomerPdfInput): CustomerPdfDoc {
  const { code, locale, items, discount } = input;
  const labels = COPY[locale];
  const currency = items[0]?.currency ?? "NOK";

  const row = (i: OrderItemInput): CustomerPdfRow => {
    const unit = money(i.unitPriceCents, i.currency);
    return {
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: formatMoney(unit, locale),
      // La SUM di riga è il totale PIENO — prezzo × quantità — perché la riga
      // deve tornare con la colonna PRICE che le sta accanto e col Delsum, che
      // è `discount.subtotal`, cioè PRE-sconto. Prima qui stava il netto del
      // motore: 4 × 450 dava «Sum 1 710», la riga si contraddiceva da sola e lo
      // sconto compariva due volte. Lo sconto ha UN posto, il riepilogo sotto.
      lineTotal: formatMoney(multiply(unit, i.quantity), locale),
    };
  };

  const savedCents = discount.subtotal.amountCents - discount.total.amountCents;
  const seller = sellerLines(input.seller, labels);
  const addr = input.address;
  const hasAddress = Boolean(addr.address || addr.zipcode || addr.city || addr.country);

  return {
    orderCode: code,
    date: formatDate(input.now ?? new Date(), locale),
    locale,
    designs: designBlocks(items, locale, row),
    subtotal: formatMoney(discount.subtotal, locale),
    discount: savedCents > 0 ? formatMoney(money(savedCents, currency), locale) : null,
    total: formatMoney(discount.total, locale),
    vatIncluded: input.seller.vatRegistered
      ? formatMoney(splitVatInclusive(discount.total).vat, locale)
      : null,
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
          link: input.vipps.link,
          melding: melding(locale, code),
        }
      : null,
    seller: seller.length > 0 ? seller : null,
    labels,
  };
}
