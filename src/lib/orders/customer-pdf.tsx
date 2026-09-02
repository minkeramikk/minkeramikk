import "server-only";

import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { CustomerPdfDoc } from "./customer-pdf-content";

/**
 * R4-PDF-CLIENTE — il riepilogo per il CLIENTE: A4, layout PROPRIO.
 *
 * UNA pagina finché i design sono pochi; con un ordine misto il documento può
 * andare a due, e @react-pdf impagina da sé. Ciò che NON si spezza a metà è
 * l'intestazione di un design e il blocco pagamento (`wrap={false}`).
 *
 * Riusa il motore di F32, non il suo layout: `lab-pdf.tsx` non si importa e non
 * si tocca (AC4). Quello è un ordine di lavorazione per il ceramista, questo è
 * una ricevuta con le istruzioni di pagamento.
 *
 * NESSUN `Font.register`: Helvetica di default, come il PDF lab. Registrare un
 * font significherebbe incorporarne i byte, e il budget è < 300 KB.
 *
 * @react-pdf non legge le CSS variables: i token del tema sono inlineati come
 * costanti, esattamente come in `lab-pdf.tsx` — è un artefatto di stampa, non
 * il design system del sito.
 */
const THEME = {
  ink: "#2b2330",
  accent: "#7d4f9c",
  border: "#e7dfe6",
  muted: "#6b6470",
  light: "#fbe9e4",
  white: "#ffffff",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 0,
    fontSize: 10,
    color: THEME.ink,
    fontFamily: "Helvetica",
  },
  top: {
    backgroundColor: THEME.ink,
    color: THEME.white,
    paddingVertical: 18,
    paddingHorizontal: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  brand: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  topSub: { fontSize: 9, color: "#cdb8db", marginTop: 2 },
  code: { fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "right" },
  date: { fontSize: 9, color: "#cdb8db", marginTop: 2, textAlign: "right" },

  body: { paddingHorizontal: 32, paddingTop: 16 },
  sectionLabel: {
    fontSize: 8,
    color: THEME.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  /** Lo stacco fra un design e il successivo: senza, la tabella del primo e
   *  l'intestazione del secondo si toccano e sembrano la stessa cosa. */
  blockGap: { marginTop: 18 },
  designRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  plate: { width: 96, height: 96, borderRadius: 48, objectFit: "cover" },
  designName: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  choice: { fontSize: 9.5, color: THEME.muted, marginTop: 2 },
  note: {
    marginTop: 8,
    backgroundColor: THEME.light,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  noteText: { fontSize: 9.5 },

  table: { marginTop: 16, borderTopWidth: 1, borderTopColor: THEME.border },
  tr: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  th: { fontSize: 8, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  colName: { flex: 1 },
  colQty: { width: 44, textAlign: "right" },
  colPrice: { width: 78, textAlign: "right" },
  colSum: { width: 84, textAlign: "right" },

  totals: { marginTop: 10, alignItems: "flex-end" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", gap: 14, marginTop: 2 },
  totalLabel: { fontSize: 9.5, color: THEME.muted },
  totalValue: { fontSize: 9.5, width: 84, textAlign: "right" },
  grand: { fontSize: 13, fontFamily: "Helvetica-Bold", width: 84, textAlign: "right" },
  vatLabel: { fontSize: 8.5, color: THEME.muted },
  vatValue: { fontSize: 8.5, color: THEME.muted, width: 84, textAlign: "right" },
  shipping: { fontSize: 8.5, color: THEME.muted, marginTop: 3 },

  pay: {
    marginTop: 18,
    backgroundColor: THEME.light,
    borderRadius: 8,
    padding: 14,
  },
  qr: { width: 108, height: 108, backgroundColor: THEME.white, borderRadius: 6 },
  payTitle: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  payNumber: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 4 },
  payMelding: { fontSize: 9.5, marginTop: 6, lineHeight: 1.4 },
  payRow: { flexDirection: "row", gap: 14, alignItems: "center" },
  payLink: { fontSize: 9, color: THEME.accent, marginTop: 8 },

  ship: { marginTop: 16 },
  shipLine: { fontSize: 9.5, color: THEME.muted },

  footer: {
    position: "absolute",
    bottom: 16,
    left: 32,
    right: 32,
    alignItems: "center",
  },
  footerLine: { fontSize: 8.5, color: THEME.muted, textAlign: "center" },
  sellerBlock: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    alignItems: "center",
    width: "100%",
  },
  sellerLine: { fontSize: 8, color: THEME.muted, textAlign: "center", marginTop: 1 },
});

/** L'altezza da tenere libera in fondo a ogni pagina: l'ancoraggio (16) + la
 *  riga dei contatti + il blocco venditore, che cresce con le sue righe. */
const footerSpace = (seller: string[] | null) =>
  16 + 14 + (seller ? 12 + seller.length * 10 : 0) + 8;

export function CustomerPdfDocument({
  doc,
  plateDataUris,
  qrDataUri,
}: {
  doc: CustomerPdfDoc;
  /** Le anteprime composite, per `configCode`. Chiave assente → quel blocco
   *  resta testuale, ed è completo lo stesso. */
  plateDataUris: Record<string, string>;
  /** Il QR Vipps; null → il blocco pagamento resta comunque leggibile. */
  qrDataUri: string | null;
}) {
  const t = doc.labels;
  return (
    <Document title={`${t.title} ${doc.orderCode}`}>
      {/* Il piè di pagina è `fixed` e ancorato in basso, quindi NON occupa
          spazio nel flusso: il margine inferiore glielo deve fare la pagina, e
          deve valere per quante righe il venditore ha davvero. Finché il
          documento stava in una pagina il testo non arrivava mai laggiù e i 34
          pt fissi bastavano; con l'impaginazione ci arriva, e le scelte
          dell'ultimo design finivano SOTTO l'indirizzo del negozio. */}
      <Page size="A4" style={[s.page, { paddingBottom: footerSpace(doc.seller) }]}>
        {/* `fixed`: con più design il documento va a due pagine, e la testata si
            ripete — la seconda pagina porta il suo numero d'ordine e nasce con
            il margine superiore che le serve, invece di partire dal bordo. */}
        <View style={s.top} fixed>
          <View>
            <Text style={s.brand}>Min Keramikk</Text>
            <Text style={s.topSub}>{t.title}</Text>
          </View>
          <View>
            <Text style={s.code}>{doc.orderCode}</Text>
            <Text style={s.date}>{doc.date}</Text>
          </View>
        </View>

        <View style={s.body}>
          {/* UN blocco per design, ognuno con le SUE righe: su un ordine misto
              si deve leggere quale riga appartiene a quale design senza doverlo
              dedurre. Le righe senza design stanno nell'ultimo blocco, che di
              intestazione non ne ha. */}
          {doc.designs.map((block, bi) => (
            <View key={bi} style={bi > 0 ? s.blockGap : undefined}>
              {block.name && (
                // `wrap={false}`: l'intestazione non si spezza fra due pagine —
                // il piatto da una parte e il suo nome dall'altra non si legge.
                // `minPresenceAhead`: e non resta in fondo a una pagina con le
                // sue righe di là — la pagina dopo aprirebbe con un prodotto
                // senza design sopra, cioè di nuovo «di quale design è questa
                // riga?». Sotto i 70 pt liberi il blocco intero passa oltre.
                <View wrap={false} minPresenceAhead={70}>
                  <Text style={s.sectionLabel}>{t.design}</Text>
                  <View style={s.designRow}>
                    {block.showPlate && block.configCode && plateDataUris[block.configCode] && (
                      // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image has no alt
                      <Image src={plateDataUris[block.configCode]} style={s.plate} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.designName}>{block.name}</Text>
                      {block.selections.map((c, i) => (
                        <Text key={i} style={s.choice}>
                          {c.label}: {c.option}
                        </Text>
                      ))}
                    </View>
                  </View>
                </View>
              )}

              {/* Assenti del tutto quando non ci sono: AC2. E appartengono a
                  QUESTO design soltanto. */}
              {block.customText && (
                <View style={s.note} wrap={false}>
                  <Text style={s.sectionLabel}>{t.inscription}</Text>
                  <Text style={s.noteText}>«{block.customText}»</Text>
                </View>
              )}
              {block.customNote && (
                <View style={s.note} wrap={false}>
                  <Text style={s.sectionLabel}>{t.colourNote}</Text>
                  <Text style={s.noteText}>{block.customNote}</Text>
                </View>
              )}

              <View style={s.table}>
                <View style={s.tr}>
                  <Text style={[s.th, s.colName]}>{t.product}</Text>
                  <Text style={[s.th, s.colQty]}>{t.qty}</Text>
                  <Text style={[s.th, s.colPrice]}>{t.unitPrice}</Text>
                  <Text style={[s.th, s.colSum]}>{t.lineTotal}</Text>
                </View>
                {block.items.map((it, i) => (
                  <View key={i} style={s.tr}>
                    <Text style={s.colName}>{it.productName}</Text>
                    <Text style={s.colQty}>{it.quantity}</Text>
                    <Text style={s.colPrice}>{it.unitPrice}</Text>
                    <Text style={s.colSum}>{it.lineTotal}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}

          {/* UNO SOLO, alla fine: lo sconto è calcolato sul carrello intero. */}
          <View style={s.totals}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>{t.subtotal}</Text>
              <Text style={s.totalValue}>{doc.subtotal}</Text>
            </View>
            {doc.discount && (
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>{t.discount}</Text>
                {/* Trattino ASCII, non il segno meno U+2212: la Helvetica
                    standard di @react-pdf non ce l'ha e lo lascia CADERE in
                    silenzio — su una ricevuta «Discount NOK 90» senza segno si
                    legge come un addebito. Visto in un PDF reale, non dedotto. */}
                <Text style={s.totalValue}>-{doc.discount}</Text>
              </View>
            )}
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>{t.total}</Text>
              <Text style={s.grand}>{doc.total}</Text>
            </View>
            {/* SOTTO il Totale, e volutamente secondaria. Fra Delsum e Totale
                si leggerebbe come un addendo — qualcosa da SOMMARE — che è
                l'esatto contrario di quello che è: i prezzi la contengono già
                (termini di vendita, legal.terms in entrambe le lingue). */}
            {doc.vatIncluded && (
              <View style={s.totalRow}>
                <Text style={s.vatLabel}>{t.vatIncluded}</Text>
                <Text style={s.vatValue}>{doc.vatIncluded}</Text>
              </View>
            )}
            <Text style={s.shipping}>
              {doc.shippingIncluded ? t.shippingIncluded : t.shippingToBeConfirmed}
            </Text>
          </View>

          {/* Il blocco pagamento. Gerarchia INVERSA a quella della mail
              (email-html.ts:428-432): là il numero è primario perché i client di
              posta bloccano le immagini — questo PDF è la risposta a quel
              problema, quindi qui il QR è primario. Con `number` NULL, che è lo
              stato reale del negozio, il QR è anche l'unica cosa che c'è. */}
          {doc.payment && (
            // `wrap={false}`: è la parte che serve per PAGARE — QR, numero e
            // istruzione melding — e spezzata fra due pagine non paga niente.
            <View style={s.pay} wrap={false}>
              <View style={s.payRow}>
                {doc.payment.showQr && qrDataUri && (
                  // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image has no alt
                  <Image src={qrDataUri} style={s.qr} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.payTitle}>{t.payTitle}</Text>
                  {doc.payment.number ? (
                    <>
                      <Text style={s.sectionLabel}>{t.payNumberLabel}</Text>
                      <Text style={s.payNumber}>{doc.payment.number}</Text>
                    </>
                  ) : (
                    doc.payment.showQr && <Text style={s.choice}>{t.payQrLabel}</Text>
                  )}
                  <Text style={s.payMelding}>{doc.payment.melding}</Text>
                </View>
              </View>
              {/* SOTTO il QR, per esteso. Il PDF arriva per mail: chi lo apre
                  sul telefono non può inquadrare col telefono il QR che quello
                  stesso telefono sta mostrando, e il link è l'unico percorso
                  che gli resta — il caso più probabile, non un ripiego. */}
              {doc.payment.link && <Text style={s.payLink}>{doc.payment.link}</Text>}
            </View>
          )}

          {doc.shipTo && (
            <View style={s.ship}>
              <Text style={s.sectionLabel}>{t.shipTo}</Text>
              <Text style={s.shipLine}>{doc.shipTo.name}</Text>
              {doc.shipTo.address && <Text style={s.shipLine}>{doc.shipTo.address}</Text>}
              {/* Il paese su una riga PROPRIA: unito agli altri dava
                  «SW1A 1AA London United Kingdom», che non è un indirizzo. */}
              {(doc.shipTo.zipcode || doc.shipTo.city) && (
                <Text style={s.shipLine}>
                  {[doc.shipTo.zipcode, doc.shipTo.city].filter(Boolean).join(" ")}
                </Text>
              )}
              {doc.shipTo.country && <Text style={s.shipLine}>{doc.shipTo.country}</Text>}
            </View>
          )}
        </View>

        {/* I contatti di sempre e, SOTTO, l'identità del venditore. Ogni riga
            esiste solo se ha un valore (`doc.seller` è già filtrato): con i
            campi vuoti — lo stato di oggi — il piè di pagina è esattamente
            quello di prima. */}
        <View style={s.footer} fixed>
          <Text style={s.footerLine}>{t.contact}</Text>
          {doc.seller && (
            <View style={s.sellerBlock}>
              {doc.seller.map((line, i) => (
                <Text key={i} style={s.sellerLine}>
                  {line}
                </Text>
              ))}
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
}
