import { describe, it, expect } from "vitest";
import {
  buildCustomerPdfDoc,
  splitVatInclusive,
  MVA_RATE_PCT,
  MAX_COMPOSED_PLATES,
  type CustomerPdfDoc,
  type CustomerPdfInput,
} from "./customer-pdf-content";
import { computeCartDiscount, EMPTY_CONFIG } from "@/lib/discounts/discount";
import { NO_VIPPS, type VippsSettings } from "./vipps";
import { NO_SELLER, type SellerIdentity } from "./seller";
import { formatMoney, money } from "@/lib/money/money";
import type { OrderItemInput } from "./schema";

const UNIT = 45000;
const VIPPS_REAL: VippsSettings = {
  // Lo stato REALE su PROD e STAGING (verificato 2/9): QR e link sì, numero NO.
  qrImage: "vipps/qr.png",
  number: null,
  link: "https://qr.vipps.no/x",
};

/** Una riga d'ordine. I campi della lista FUORI esistono nel payload (il
 *  fornitore ci sta per forza: serve alla RPC) — il punto del test AC3 è che non
 *  arrivino nel DOCUMENTO. */
const item = (over: Partial<OrderItemInput> = {}): OrderItemInput =>
  ({
    supplierId: "00000000-0000-0000-0000-000000000001",
    supplierName: "SUPPLIER-SENTINEL",
    productId: null,
    productName: "Dyp tallerken",
    unitPriceCents: UNIT,
    currency: "NOK",
    quantity: 2,
    configCode: "MK-KRB-A-Q",
    configSnapshot: {
      designSlug: "krabbe",
      designName: "Krabbe",
      designNameNo: "Krabbe",
      designNameEn: "Crab",
      selections: [{ label: "Kant", option: "Safran", hex: "#e0a020" }],
    },
    ...over,
  }) as OrderItemInput;

function doc(over: Partial<CustomerPdfInput> & { items?: OrderItemInput[] } = {}) {
  const items = over.items ?? [item()];
  return buildCustomerPdfDoc({
    code: "MK-1042",
    customerName: "Kari Nordmann",
    locale: "no",
    items,
    discount: computeCartDiscount(
      items.map((i, idx) => ({
        id: String(idx),
        productId: i.productId,
        unitPriceCents: i.unitPriceCents,
        currency: i.currency,
        quantity: i.quantity,
      })),
      EMPTY_CONFIG
    ),
    address: {},
    vipps: VIPPS_REAL,
    // Lo stato di oggi: nessun dato del venditore, MVA spenta. Ogni test che
    // vuole l'altro stato lo chiede esplicitamente — il default non lo decide.
    seller: NO_SELLER,
    now: new Date("2026-08-28T12:02:00.000Z"),
    ...over,
  });
}

/** Le righe prodotto di TUTTO il documento, nell'ordine in cui si leggono. */
const allRows = (d: CustomerPdfDoc) => d.designs.flatMap((b) => b.items);

describe("buildCustomerPdfDoc", () => {
  it("AC2 — l'iscrizione compare come nel recap; senza, la sezione è assente", () => {
    const withText = doc({
      items: [item({ configSnapshot: { ...item().configSnapshot, customText: "Til mamma" } as never })],
    });
    expect(withText.designs[0].customText).toBe("Til mamma");
    expect(doc().designs[0].customText).toBeNull();
  });

  // AC3 — la lista FUORI. NON si vietano sottostringhe generiche: i contatti e
  // il brand del negozio sono nella lista DENTRO (card §Cosa), quindi vietare
  // "@minkeramikk" metterebbe il test contro la card, e "gram" colpirebbe
  // «Instagram». Si vieta ciò che è davvero del laboratorio, con valori
  // SENTINELLA che nel documento non possono comparire per caso.
  it("AC3 — niente dati del laboratorio: fornitore, note interne, pesi", () => {
    const flat = JSON.stringify(doc());
    for (const sentinel of ["SUPPLIER-SENTINEL", "00000000-0000-0000-0000-000000000001"]) {
      expect(flat).not.toContain(sentinel);
    }
    expect(flat).not.toMatch(/weight|vekt|gram(?!$)/i);
  });

  it("i contatti pubblici del negozio, invece, CI SONO (card §Cosa)", () => {
    expect(doc().labels.contact).toContain("minkeramikk");
  });

  it("le scelte per categoria portano il NOME del colore, non l'hex", () => {
    expect(doc().designs[0]).toMatchObject({
      name: "Krabbe",
      selections: [{ label: "Kant", option: "Safran" }],
    });
    expect(JSON.stringify(doc().designs)).not.toContain("#e0a020");
  });

  it("il nome del design segue la lingua dell'ordine", () => {
    expect(doc({ locale: "en" }).designs[0].name).toBe("Crab");
  });

  it("lo sconto compare solo quando c'è", () => {
    expect(doc().discount).toBeNull();
    const items = [item({ quantity: 8 })];
    const discounted = buildCustomerPdfDoc({
      code: "MK-1042",
      customerName: "Kari",
      locale: "no",
      items,
      discount: computeCartDiscount(
        [{ id: "0", productId: "p1", unitPriceCents: UNIT, currency: "NOK", quantity: 8 }],
        { ...EMPTY_CONFIG, tiersEnabled: true, tiers: [{ minQty: 4, pct: 10 }] }
      ),
      address: {},
      vipps: VIPPS_REAL,
      seller: NO_SELLER,
    });
    expect(discounted.discount).not.toBeNull();
  });

  it("Vipps nello STATO REALE — QR sì, numero NULL — il blocco c'è lo stesso", () => {
    const d = doc();
    expect(d.payment).not.toBeNull();
    expect(d.payment!.number).toBeNull();
    expect(d.payment!.showQr).toBe(true);
    // l'istruzione melding cita SEMPRE il numero d'ordine: è il motivo per cui
    // questo PDF esiste (i client di posta bloccano il QR della mail)
    expect(d.payment!.melding).toContain("MK-1042");
  });

  it("senza né QR né numero il blocco pagamento sparisce e il documento resta completo", () => {
    const d = doc({ vipps: NO_VIPPS });
    expect(d.payment).toBeNull();
    expect(d.total).toBeTruthy();
    expect(allRows(d)).toHaveLength(1);
  });

  it("EN e NO cambiano le etichette, mai i numeri", () => {
    const no = doc(), en = doc({ locale: "en" });
    expect(en.labels.total).not.toBe(no.labels.total);
    expect(allRows(en).map((i) => i.quantity)).toEqual(allRows(no).map((i) => i.quantity));
  });

  it("l'indirizzo porta il poststed di ORDERS-PLUS quando c'è, e sparisce quando non c'è", () => {
    expect(doc({ address: { zipcode: "0155", city: "Oslo" } }).shipTo).toMatchObject({
      city: "Oslo",
      zipcode: "0155",
      country: null,
    });
    expect(doc().shipTo).toBeNull();
  });


  it("ogni stringa del documento è disegnabile dalla Helvetica del PDF", () => {
    // @react-pdf usa la Helvetica standard, che copre WinAnsi (CP1252) e nulla
    // più: i caratteri fuori da lì CADONO in silenzio. Il segno meno U+2212
    // spariva dalla riga «Discount», che così si leggeva come un addebito —
    // visto in un PDF reale, non dedotto. L'em dash, le virgolette basse e il
    // punto medio invece ci sono, ed è per questo che il test non è un banale
    // «solo ASCII».
    const WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
    const drawable = (ch: string) => {
      const cp = ch.codePointAt(0)!;
      if (ch === "\n") return true;
      if (cp >= 0x20 && cp <= 0x7e) return true; // ASCII stampabile
      if (cp >= 0xa0 && cp <= 0xff) return true; // Latin-1 alto
      return WINANSI_EXTRA.includes(ch);
    };
    const walk = (v: unknown): string[] =>
      typeof v === "string"
        ? [v]
        : Array.isArray(v)
          ? v.flatMap(walk)
          : v && typeof v === "object"
            ? Object.values(v).flatMap(walk)
            : [];
    for (const str of walk(doc({ address: { city: "Oslo" } }))) {
      const bad = [...str].filter((ch) => !drawable(ch));
      expect(bad, `carattere non disegnabile in «${str}»`).toEqual([]);
    }
  });

  it("il guardiano riconosce davvero il carattere che era sparito", () => {
    // Senza questa, il test qui sopra potrebbe passare per pigrizia.
    const cp = "−".codePointAt(0)!;
    expect(cp).toBe(0x2212);
    expect(cp >= 0xa0 && cp <= 0xff).toBe(false);
    expect("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".includes("−")).toBe(false);
  });

  // ── A1 · la riga prodotto deve TORNARE ────────────────────────────────
  it("la SUM di riga è prezzo × quantità, coerente con PRICE e col Delsum", () => {
    // Il caso esatto del PDF di evidenza EN: «QTY 4 · PRICE 450 · SUM 1 710»,
    // mentre 4 × 450 fa 1 800. La SUM portava il netto POST-sconto accanto a un
    // PRICE pieno e a un Delsum PRE-sconto: la riga si contraddiceva da sola e
    // lo sconto compariva due volte. Ora lo sconto sta in un posto solo.
    const items = [item({ unitPriceCents: 45000, quantity: 4 })];
    const d = buildCustomerPdfDoc({
      code: "MK-2536",
      customerName: "Kari",
      locale: "en",
      items,
      discount: computeCartDiscount(
        [{ id: "0", productId: "p1", unitPriceCents: 45000, currency: "NOK", quantity: 4 }],
        { ...EMPTY_CONFIG, tiersEnabled: true, tiers: [{ minQty: 4, pct: 5 }] }
      ),
      address: {},
      vipps: VIPPS_REAL,
      seller: NO_SELLER,
    });
    expect(allRows(d)[0].unitPrice).toBe(formatMoney(money(45000), "en"));
    expect(allRows(d)[0].lineTotal).toBe(formatMoney(money(180000), "en")); // 1 800
    expect(d.subtotal).toBe(formatMoney(money(180000), "en"));
    expect(d.discount).toBe(formatMoney(money(9000), "en")); // −90
    expect(d.total).toBe(formatMoney(money(171000), "en")); // 1 710
  });

  it("la data è in ora di OSLO, non del server", () => {
    // Su Vercel il server è in UTC, e senza il pin questo istante — le 00:30
    // norvegesi del 28 — uscirebbe come «27. aug. 2026», cioè il giorno prima.
    // Verificato con `TZ=UTC node`: pinned 28, unpinned 27.
    const at = new Date("2026-08-27T22:30:00.000Z");
    expect(doc({ now: at }).date).toBe("28. aug. 2026");
    expect(doc({ now: at, locale: "en" }).date).toBe("28 August 2026");
  });

  it("il mese inglese è per esteso: en-GB abbrevia September in «Sept»", () => {
    // «02 Sept 2026» su una ricevuta si legge come un refuso. Il norvegese resta
    // abbreviato, che lì è la forma corretta.
    const sept = new Date("2026-09-02T10:00:00.000Z");
    expect(doc({ now: sept, locale: "en" }).date).toBe("2 September 2026");
    expect(doc({ now: sept }).date).toBe("02. sep. 2026");
  });

  // ── A2 · il link Vipps ─────────────────────────────────────────────────
  it("il blocco pagamento porta il LINK, non solo il QR", () => {
    // Chi apre il PDF sul telefono non può inquadrare col telefono il QR che
    // quello stesso telefono mostra: il link è l'unico percorso che gli resta.
    expect(doc().payment!.link).toBe("https://qr.vipps.no/x");
  });

  it("senza link il blocco pagamento resta valido (QR da solo)", () => {
    const d = doc({ vipps: { ...VIPPS_REAL, link: null } });
    expect(d.payment!.link).toBeNull();
    expect(d.payment!.showQr).toBe(true);
  });
});

// ── R4-PDF-MULTIDESIGN · un ordine, N design ────────────────────────────
/**
 * Il difetto: il documento assumeva UN design per ordine, lo prendeva dalla
 * prima riga che ne avesse uno e lo attribuiva a tutte. Su MK-1024 — tre righe,
 * la terza di un altro design — il PDF mostrava un blocco solo, e chi lo leggeva
 * credeva che tutte e tre fossero quel design.
 */
describe("un ordine con più design", () => {
  /** Una riga d'un design qualunque: la coppia slug/configCode è ciò che il
   *  compositing usa, e deve restare della STESSA riga. */
  const line = (
    slug: string,
    nameNo: string,
    nameEn: string,
    configCode: string,
    over: Partial<OrderItemInput> = {},
    snapOver: Record<string, unknown> = {}
  ): OrderItemInput =>
    item({
      configCode,
      configSnapshot: {
        designSlug: slug,
        designName: nameNo,
        designNameNo: nameNo,
        designNameEn: nameEn,
        selections: [{ label: "Kant", option: "Safran", hex: "#e0a020" }],
        ...snapOver,
      },
      ...over,
    } as Partial<OrderItemInput>);

  /** La forma esatta di MK-1024: due righe Amalfi, la terza di un altro design. */
  const MK_1024 = [
    line("amalfi-animals", "Amalfi dyr", "Amalfi animals", "MK-AMF-A-Q", {
      productName: "Dyp tallerken",
      quantity: 1,
    }),
    line("amalfi-animals", "Amalfi dyr", "Amalfi animals", "MK-AMF-A-Q", {
      productName: "Krus",
      quantity: 2,
    }),
    line("alici-pasta", "Alici pastafat", "Alici pasta plate", "MK-ALC-B-R", {
      productName: "Pastaplate «Prete»",
      quantity: 3,
    }),
  ];

  it("un design solo: un blocco, tutte le righe dentro, niente blocco in coda", () => {
    const d = doc({ items: [item({ productName: "Dyp tallerken" }), item({ productName: "Krus" })] });
    expect(d.designs).toHaveLength(1);
    expect(d.designs[0].name).toBe("Krabbe");
    expect(d.designs[0].items.map((r) => r.productName)).toEqual(["Dyp tallerken", "Krus"]);
  });

  it("MK-1024: tre righe, DUE blocchi, e ogni riga sta sotto il suo design", () => {
    const d = doc({ items: MK_1024 });
    expect(d.designs.map((b) => b.name)).toEqual(["Amalfi dyr", "Alici pastafat"]);
    expect(d.designs[0].items.map((r) => r.productName)).toEqual(["Dyp tallerken", "Krus"]);
    expect(d.designs[1].items.map((r) => r.productName)).toEqual(["Pastaplate «Prete»"]);
    // …e la riga Alici non è più attribuita all'Amalfi: era IL difetto.
    expect(d.designs[0].items.map((r) => r.productName)).not.toContain("Pastaplate «Prete»");
  });

  it("slug e configCode di un blocco vengono dalla STESSA riga", () => {
    // Prima uscivano da due `find()` indipendenti: su un ordine misto
    // componevano un piatto che non corrispondeva a nessuna delle due righe.
    const d = doc({ items: MK_1024 });
    expect(d.designs.map((b) => [b.designSlug, b.configCode])).toEqual([
      ["amalfi-animals", "MK-AMF-A-Q"],
      ["alici-pasta", "MK-ALC-B-R"],
    ]);
  });

  it("stesso design, due combinazioni di colore: DUE blocchi", () => {
    // Raggruppare per slug li fonderebbe e mostrerebbe un piatto solo — lo
    // stesso difetto con un'altra faccia. Due configCode sono due piatti
    // VISIBILMENTE diversi, ed è ciò che il cliente ha ordinato.
    const d = doc({
      items: [
        line("krabbe", "Krabbe", "Crab", "MK-KRB-A-Q", { productName: "Dyp tallerken" }, {
          selections: [{ label: "Kant", option: "Safran", hex: "#e0a020" }],
        }),
        line("krabbe", "Krabbe", "Crab", "MK-KRB-B-Q", { productName: "Krus" }, {
          selections: [{ label: "Kant", option: "Havblå", hex: "#2060a0" }],
        }),
      ],
    });
    expect(d.designs).toHaveLength(2);
    expect(d.designs.map((b) => b.name)).toEqual(["Krabbe", "Krabbe"]);
    expect(d.designs.map((b) => b.selections[0].option)).toEqual(["Safran", "Havblå"]);
  });

  it("🔒 l'iscrizione del design A non compare nel blocco del design B", () => {
    // L'effetto peggiore del difetto: il testo inciso sulle Amalfi veniva
    // presentato come valido anche per le Alici.
    const d = doc({
      items: [
        line("amalfi-animals", "Amalfi dyr", "Amalfi animals", "MK-AMF-A-Q", {}, {
          customText: "Til mamma",
          customNote: "Varme farger",
        }),
        line("alici-pasta", "Alici pastafat", "Alici pasta plate", "MK-ALC-B-R", {
          productName: "Pastaplate «Prete»",
        }),
      ],
    });
    expect(d.designs[0].customText).toBe("Til mamma");
    expect(d.designs[0].customNote).toBe("Varme farger");
    expect(d.designs[1].customText).toBeNull();
    expect(d.designs[1].customNote).toBeNull();
    expect(JSON.stringify(d.designs[1])).not.toContain("Til mamma");
  });

  it("stessa configurazione, iscrizioni diverse: due blocchi, un piatto solo", () => {
    // L'iscrizione NON viaggia nel configCode (ADR 0011): senza entrare nella
    // chiave, «Til mamma» finirebbe attribuita anche alla riga di «Til pappa».
    // L'immagine però è la stessa, e infatti la chiave del piatto è una sola.
    const d = doc({
      items: [
        line("krabbe", "Krabbe", "Crab", "MK-KRB-A-Q", { productName: "Dyp tallerken" }, {
          customText: "Til mamma",
        }),
        line("krabbe", "Krabbe", "Crab", "MK-KRB-A-Q", { productName: "Krus" }, {
          customText: "Til pappa",
        }),
      ],
    });
    expect(d.designs.map((b) => b.customText)).toEqual(["Til mamma", "Til pappa"]);
    expect(new Set(d.designs.map((b) => b.configCode)).size).toBe(1);
  });

  it("riga senza snapshot: blocco in coda, senza intestazione, mai riattribuita", () => {
    const d = doc({
      items: [
        line("amalfi-animals", "Amalfi dyr", "Amalfi animals", "MK-AMF-A-Q", {}, {
          customText: "Til mamma",
        }),
        item({ productName: "Gavekort", configSnapshot: null }),
      ],
    });
    const tail = d.designs.at(-1)!;
    expect(d.designs).toHaveLength(2);
    expect(tail.name).toBeNull();
    expect(tail.selections).toEqual([]);
    expect(tail.customText).toBeNull();
    expect(tail.showPlate).toBe(false);
    expect(tail.items.map((r) => r.productName)).toEqual(["Gavekort"]);
    // e non è finita nel blocco del design che la precede
    expect(d.designs[0].items.map((r) => r.productName)).not.toContain("Gavekort");
  });

  it("il tetto delle immagini: 6 design distinti → 4 piatti, gli altri due senza", () => {
    const items = Array.from({ length: 6 }, (_, n) =>
      line(`design-${n}`, `Design ${n}`, `Design ${n}`, `MK-D${n}-A`, {
        productName: `Ceramica ${n}`,
      })
    );
    const d = doc({ items });
    expect(d.designs).toHaveLength(6);
    expect(d.designs.filter((b) => b.showPlate)).toHaveLength(MAX_COMPOSED_PLATES);
    // i due oltre il tetto restano COMPLETI: sparisce l'immagine, non il resto
    for (const b of d.designs.slice(MAX_COMPOSED_PLATES)) {
      expect(b.showPlate).toBe(false);
      expect(b.name).toBeTruthy();
      expect(b.items).toHaveLength(1);
    }
  });

  it("i totali restano quelli del carrello INTERO, uno solo alla fine", () => {
    // 1×450 + 2×450 + 3×450 = 2 700 kr. Nessuna aritmetica per blocco.
    const d = doc({ items: MK_1024 });
    expect(allRows(d)).toHaveLength(3);
    expect(d.subtotal).toBe(formatMoney(money(6 * UNIT), "no"));
    expect(d.total).toBe(formatMoney(money(6 * UNIT), "no"));
    expect(d.discount).toBeNull();
  });
});

// ── B · MVA 25 %, SCORPORATA ────────────────────────────────────────────
describe("lo scorporo della MVA", () => {
  it("i due importi dei PDF di evidenza", () => {
    expect(splitVatInclusive(money(90000)).vat.amountCents).toBe(18000); // 900 → 180
    expect(splitVatInclusive(money(90000)).net.amountCents).toBe(72000); // → 720
    expect(splitVatInclusive(money(171000)).vat.amountCents).toBe(34200); // 1 710 → 342
    expect(splitVatInclusive(money(171000)).net.amountCents).toBe(136800); // → 1 368
  });

  it("netto + MVA fa il totale ESATTAMENTE, per qualunque importo", () => {
    // Il vincolo che vieta di arrotondare i due valori per conto loro: due
    // arrotondamenti indipendenti producono righe che non tornano di 1 øre.
    // Gli importi scelti includono quelli che dividono male per 5.
    for (const cents of [1, 2, 3, 7, 99, 100, 12345, 90000, 171000, 999999]) {
      const { vat, net } = splitVatInclusive(money(cents));
      expect(net.amountCents + vat.amountCents, `${cents} øre non torna`).toBe(cents);
    }
  });

  it("la MVA è SCORPORATA, mai aggiunta: non supera mai il totale", () => {
    // I prezzi del sito sono IVA inclusa (termini di vendita, legal.terms in
    // entrambe le lingue). Aggiungere il 25 % sopra farebbe stampare un importo
    // diverso da quello che il cliente sta per pagare su Vipps.
    const { vat, net } = splitVatInclusive(money(100000));
    expect(vat.amountCents).toBe(20000); // 25/125, non 25/100
    expect(net.amountCents).toBeLessThan(100000);
  });

  it("la valuta segue il totale", () => {
    expect(splitVatInclusive(money(50000, "EUR")).vat.currency).toBe("EUR");
  });

  it("l'aliquota vive in un posto solo: la stessa costante nomina l'etichetta", () => {
    expect(MVA_RATE_PCT).toBe(25);
    expect(doc().labels.vatIncluded).toContain(String(MVA_RATE_PCT));
    expect(doc({ locale: "en" }).labels.vatIncluded).toContain(String(MVA_RATE_PCT));
  });
});

describe("la riga MVA nel documento", () => {
  const REGISTERED: SellerIdentity = { ...NO_SELLER, vatRegistered: true };

  it("🔒 SPENTA per default: non registrati in MVA-registeret, nessuna riga", () => {
    // Sotto la soglia dei 50 000 kr non lo si è, e stamparla non essendolo è
    // illegale. Il dato non è ancora noto: il default deve tacere.
    expect(doc().vatIncluded).toBeNull();
    expect(doc({ seller: { ...NO_SELLER, vatRegistered: false } }).vatIncluded).toBeNull();
  });

  it("registrati: la riga c'è, ed è la quota GIÀ contenuta nel totale", () => {
    // 2 × 450 = 900 kr → MVA 180 kr.
    const d = doc({ seller: REGISTERED });
    expect(d.total).toBe(formatMoney(money(90000), "no"));
    expect(d.vatIncluded).toBe(formatMoney(money(18000), "no"));
  });

  it("il resto del documento non cambia fra i due stati", () => {
    const off = doc(), on = doc({ seller: REGISTERED });
    expect(on.total).toBe(off.total);
    expect(on.subtotal).toBe(off.subtotal);
    expect(on.designs).toEqual(off.designs);
  });
});

// ── C · il blocco venditore ─────────────────────────────────────────────
describe("il piè di pagina del venditore", () => {
  const FULL: SellerIdentity = {
    name: "Min Keramikk AS",
    address: "Storgata 1, 0155 Oslo, Norge",
    orgNumber: "999 888 777",
    vatRegistered: true,
    email: "post@minkeramikk.no",
    phone: "+47 400 00 000",
  };

  it("tutti i campi pieni: ogni riga c'è, e l'org.nr. porta il suffisso MVA", () => {
    expect(doc({ seller: FULL }).seller).toEqual([
      "Min Keramikk AS",
      "Storgata 1, 0155 Oslo, Norge",
      "Org.nr. 999 888 777 MVA",
      "post@minkeramikk.no · +47 400 00 000",
    ]);
  });

  it("tutti i campi vuoti: nessun blocco, il piè di pagina è quello di oggi", () => {
    expect(doc().seller).toBeNull();
  });

  it("org.nr. presente ma flag FALSE: niente suffisso MVA e niente riga MVA", () => {
    // La dicitura « MVA » dopo l'organisasjonsnummer è corretta SOLO per un
    // soggetto registrato: la stessa verità governa entrambi.
    const d = doc({ seller: { ...FULL, vatRegistered: false } });
    expect(d.seller).toContain("Org.nr. 999 888 777");
    expect(JSON.stringify(d.seller)).not.toContain("MVA");
    expect(d.vatIncluded).toBeNull();
  });

  it("DEGRADA PER CAMPO: un campo vuoto si porta via la sua riga, mai un'etichetta nuda", () => {
    const onlyName = doc({ seller: { ...NO_SELLER, name: "Min Keramikk AS" } });
    expect(onlyName.seller).toEqual(["Min Keramikk AS"]);

    const noPhone = doc({ seller: { ...FULL, phone: null } });
    expect(noPhone.seller).toContain("post@minkeramikk.no");
    expect(JSON.stringify(noPhone.seller)).not.toContain("·");

    const noEmail = doc({ seller: { ...FULL, email: null, phone: "+47 400 00 000" } });
    expect(noEmail.seller).toContain("+47 400 00 000");
  });

  it("l'etichetta dell'org.nr. segue la lingua", () => {
    expect(doc({ seller: FULL, locale: "en" }).seller).toContain("Org. no. 999 888 777 MVA");
  });

  it("il documento resta una OPPSUMMERING, mai una faktura", () => {
    // Decisione PM: niente numerazione fattura, e la parola non compare.
    const flat = JSON.stringify(doc({ seller: FULL, locale: "en" })) + JSON.stringify(doc({ seller: FULL }));
    expect(flat).not.toMatch(/faktura|invoice/i);
    expect(doc().labels.title).toBe("Oppsummering av bestillingen");
    expect(doc({ locale: "en" }).labels.title).toBe("Order summary");
  });
});
