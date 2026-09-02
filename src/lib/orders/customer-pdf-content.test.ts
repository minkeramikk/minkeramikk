import { describe, it, expect } from "vitest";
import { buildCustomerPdfDoc, type CustomerPdfInput } from "./customer-pdf-content";
import { computeCartDiscount, EMPTY_CONFIG } from "@/lib/discounts/discount";
import { NO_VIPPS, type VippsSettings } from "./vipps";
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
    now: new Date("2026-08-28T12:02:00.000Z"),
    ...over,
  });
}

describe("buildCustomerPdfDoc", () => {
  it("AC2 — l'iscrizione compare come nel recap; senza, la sezione è assente", () => {
    const withText = doc({
      items: [item({ configSnapshot: { ...item().configSnapshot, customText: "Til mamma" } as never })],
    });
    expect(withText.customText).toBe("Til mamma");
    expect(doc().customText).toBeNull();
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
    expect(doc().design).toEqual({
      name: "Krabbe",
      selections: [{ label: "Kant", option: "Safran" }],
    });
    expect(JSON.stringify(doc().design)).not.toContain("#e0a020");
  });

  it("il nome del design segue la lingua dell'ordine", () => {
    expect(doc({ locale: "en" }).design!.name).toBe("Crab");
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
    expect(d.items).toHaveLength(1);
  });

  it("EN e NO cambiano le etichette, mai i numeri", () => {
    const no = doc(), en = doc({ locale: "en" });
    expect(en.labels.total).not.toBe(no.labels.total);
    expect(en.items.map((i) => i.quantity)).toEqual(no.items.map((i) => i.quantity));
  });

  it("l'indirizzo porta il poststed di ORDERS-PLUS quando c'è, e sparisce quando non c'è", () => {
    expect(doc({ address: { zipcode: "0155", city: "Oslo" } }).shipTo).toMatchObject({
      city: "Oslo",
      zipcode: "0155",
      country: null,
    });
    expect(doc().shipTo).toBeNull();
  });

  it("la data è in ora di OSLO, non del server", () => {
    // Su Vercel il server è in UTC, e senza il pin questo istante — le 00:30
    // norvegesi del 28 — uscirebbe come «27. aug. 2026», cioè il giorno prima.
    // Verificato con `TZ=UTC node`: pinned 28, unpinned 27.
    const at = new Date("2026-08-27T22:30:00.000Z");
    expect(doc({ now: at }).date).toBe("28. aug. 2026");
    expect(doc({ now: at, locale: "en" }).date).toBe("28 Aug 2026");
  });
});
