import "server-only";

import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { CustomerPdfDoc } from "./customer-pdf-content";

/**
 * R4-PDF-CLIENTE — il riepilogo per il CLIENTE: una pagina A4, layout PROPRIO.
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
    paddingBottom: 34,
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
  shipping: { fontSize: 8.5, color: THEME.muted, marginTop: 3 },

  pay: {
    marginTop: 18,
    backgroundColor: THEME.light,
    borderRadius: 8,
    padding: 14,
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  qr: { width: 108, height: 108, backgroundColor: THEME.white, borderRadius: 6 },
  payTitle: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  payNumber: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 4 },
  payMelding: { fontSize: 9.5, marginTop: 6, lineHeight: 1.4 },

  ship: { marginTop: 16 },
  shipLine: { fontSize: 9.5, color: THEME.muted },

  footer: {
    position: "absolute",
    bottom: 16,
    left: 32,
    right: 32,
    fontSize: 8.5,
    color: THEME.muted,
    textAlign: "center",
  },
});

export function CustomerPdfDocument({
  doc,
  plateDataUri,
  qrDataUri,
}: {
  doc: CustomerPdfDoc;
  /** L'anteprima composita del design; null → il blocco resta testuale. */
  plateDataUri: string | null;
  /** Il QR Vipps; null → il blocco pagamento resta comunque leggibile. */
  qrDataUri: string | null;
}) {
  const t = doc.labels;
  return (
    <Document title={`${t.title} ${doc.orderCode}`}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
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
          {doc.design && (
            <View>
              <Text style={s.sectionLabel}>{t.design}</Text>
              <View style={s.designRow}>
                {plateDataUri && (
                  // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image has no alt
                  <Image src={plateDataUri} style={s.plate} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.designName}>{doc.design.name}</Text>
                  {doc.design.selections.map((c, i) => (
                    <Text key={i} style={s.choice}>
                      {c.label}: {c.option}
                    </Text>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* Assenti del tutto quando non ci sono: AC2. */}
          {doc.customText && (
            <View style={s.note}>
              <Text style={s.sectionLabel}>{t.inscription}</Text>
              <Text style={s.noteText}>«{doc.customText}»</Text>
            </View>
          )}
          {doc.customNote && (
            <View style={s.note}>
              <Text style={s.sectionLabel}>{t.colourNote}</Text>
              <Text style={s.noteText}>{doc.customNote}</Text>
            </View>
          )}

          <View style={s.table}>
            <View style={s.tr}>
              <Text style={[s.th, s.colName]}>{t.product}</Text>
              <Text style={[s.th, s.colQty]}>{t.qty}</Text>
              <Text style={[s.th, s.colPrice]}>{t.unitPrice}</Text>
              <Text style={[s.th, s.colSum]}>{t.lineTotal}</Text>
            </View>
            {doc.items.map((it, i) => (
              <View key={i} style={s.tr}>
                <Text style={s.colName}>{it.productName}</Text>
                <Text style={s.colQty}>{it.quantity}</Text>
                <Text style={s.colPrice}>{it.unitPrice}</Text>
                <Text style={s.colSum}>{it.lineTotal}</Text>
              </View>
            ))}
          </View>

          <View style={s.totals}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>{t.subtotal}</Text>
              <Text style={s.totalValue}>{doc.subtotal}</Text>
            </View>
            {doc.discount && (
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>{t.discount}</Text>
                <Text style={s.totalValue}>−{doc.discount}</Text>
              </View>
            )}
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>{t.total}</Text>
              <Text style={s.grand}>{doc.total}</Text>
            </View>
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
            <View style={s.pay}>
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
          )}

          {doc.shipTo && (
            <View style={s.ship}>
              <Text style={s.sectionLabel}>{t.shipTo}</Text>
              <Text style={s.shipLine}>{doc.shipTo.name}</Text>
              {doc.shipTo.address && <Text style={s.shipLine}>{doc.shipTo.address}</Text>}
              <Text style={s.shipLine}>
                {[doc.shipTo.zipcode, doc.shipTo.city, doc.shipTo.country]
                  .filter(Boolean)
                  .join(" ")}
              </Text>
            </View>
          )}
        </View>

        <Text style={s.footer} fixed>
          {t.contact}
        </Text>
      </Page>
    </Document>
  );
}
