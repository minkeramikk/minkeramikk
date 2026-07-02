import "server-only";

import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { LabPdfDoc } from "./lab-pdf-content";

/**
 * Production-order PDF layout (F08), matching docs/preview/06-lab-pdf.html.
 * @react-pdf cannot read CSS variables, so the theme tokens are inlined here as
 * constants (the only place hardcoded hexes are allowed — this is a print
 * artifact, not the web design system).
 */
const THEME = {
  ink: "#2b2330",
  accent: "#7d4f9c",
  border: "#e7dfe6",
  muted: "#6b6470",
  white: "#ffffff",
};

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 40, fontSize: 10, color: THEME.ink, fontFamily: "Helvetica" },
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
  sub: { fontSize: 9, color: "#cdb8db", marginTop: 2 },
  orderCode: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  date: { fontSize: 9, color: "#cdb8db", marginTop: 2, textAlign: "right" },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  metaLabel: { fontSize: 8, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 },
  item: {
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  media: { flexDirection: "row", gap: 8 },
  mediaCol: { alignItems: "center", gap: 3 },
  mediaCaption: { fontSize: 7, color: THEME.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  plate: { width: 104, height: 104, borderWidth: 1, borderColor: THEME.border, borderRadius: 6, objectFit: "contain" },
  platePlaceholder: { width: 104, height: 104, borderWidth: 1, borderColor: THEME.border, borderRadius: 6, backgroundColor: "#f4eef2" },
  itemBody: { flex: 1 },
  itemHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  product: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  design: { fontSize: 9, color: THEME.muted, marginTop: 1 },
  qty: { fontSize: 11, fontFamily: "Helvetica-Bold", color: THEME.accent },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  cell: { width: "50%", flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 5 },
  swatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: THEME.border },
  cellLabel: { fontSize: 8, color: THEME.muted },
  cellOption: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  cellHex: { fontSize: 8, color: THEME.muted },
  code: { fontSize: 9, color: THEME.accent, marginTop: 6, fontFamily: "Helvetica-Bold" },
  note: { marginTop: 4, fontSize: 9, color: THEME.muted },
  foot: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    color: THEME.muted,
    fontSize: 9,
  },
  total: { fontFamily: "Helvetica-Bold", color: THEME.ink },
  ship: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    backgroundColor: "#faf6f9",
  },
  shipName: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 3 },
  shipLine: { fontSize: 10, color: THEME.ink, marginTop: 1 },
  shipMuted: { fontSize: 9, color: THEME.muted, marginTop: 3 },
});

export interface LabPdfRenderItem {
  item: LabPdfDoc["items"][number];
  /** Composed plate as a data URI, or null when it could not be composed. */
  plateDataUri: string | null;
  /** F32: ordered ceramic photo as a PNG data URI, or null → placeholder. */
  productPhotoDataUri: string | null;
}

export function LabPdfDocument({
  doc,
  items,
}: {
  doc: LabPdfDoc;
  items: LabPdfRenderItem[];
}) {
  return (
    <Document title={`Production order ${doc.orderCode} — ${doc.supplierName}`}>
      <Page size="A4" style={s.page}>
        <View style={s.top} fixed>
          <View>
            <Text style={s.brand}>minkeramikk.no</Text>
            <Text style={s.sub}>Production order · for workshop</Text>
          </View>
          <View>
            <Text style={s.orderCode}>{doc.orderCode}</Text>
            <Text style={s.date}>{doc.date}</Text>
          </View>
        </View>

        <View style={s.meta}>
          <View>
            <Text style={s.metaLabel}>Workshop</Text>
            <Text style={s.metaValue}>{doc.supplierName}</Text>
          </View>
          <View>
            <Text style={s.metaLabel}>Items</Text>
            <Text style={s.metaValue}>
              {doc.items.length} {doc.items.length === 1 ? "line" : "lines"} · {doc.totalPieces} pcs
            </Text>
          </View>
          <View>
            <Text style={s.metaLabel}>Reference</Text>
            <Text style={s.metaValue}>{doc.orderCode}</Text>
          </View>
        </View>

        {/* Ship-to: the workshop ships the finished pieces to this customer. */}
        <View style={s.ship}>
          <Text style={s.metaLabel}>Ship to · customer</Text>
          <Text style={s.shipName}>{doc.shipTo.name}</Text>
          {doc.shipTo.address ? (
            <Text style={s.shipLine}>{doc.shipTo.address}</Text>
          ) : null}
          {doc.shipTo.zipcode || doc.shipTo.country ? (
            <Text style={s.shipLine}>
              {[doc.shipTo.zipcode, doc.shipTo.country].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
          {doc.shipTo.phone ? (
            <Text style={s.shipMuted}>Tel: {doc.shipTo.phone}</Text>
          ) : null}
          {doc.shipTo.email ? (
            <Text style={s.shipMuted}>Email: {doc.shipTo.email}</Text>
          ) : null}
          {!doc.shipTo.address && !doc.shipTo.zipcode && !doc.shipTo.country ? (
            <Text style={s.shipMuted}>
              No address on file — confirm with the customer before shipping.
            </Text>
          ) : null}
        </View>

        {items.map(({ item, plateDataUri, productPhotoDataUri }, i) => (
          <View key={i} style={s.item} wrap={false}>
            <View style={s.media}>
              <View style={s.mediaCol}>
                {plateDataUri ? (
                  // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image has no alt
                  <Image src={plateDataUri} style={s.plate} />
                ) : (
                  <View style={s.platePlaceholder} />
                )}
                <Text style={s.mediaCaption}>Design</Text>
              </View>
              <View style={s.mediaCol}>
                {productPhotoDataUri ? (
                  // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image has no alt
                  <Image src={productPhotoDataUri} style={s.plate} />
                ) : (
                  <View style={s.platePlaceholder} />
                )}
                <Text style={s.mediaCaption}>Ceramic</Text>
              </View>
            </View>
            <View style={s.itemBody}>
              <View style={s.itemHead}>
                <View>
                  <Text style={s.product}>{item.productName}</Text>
                  <Text style={s.design}>{item.designName}</Text>
                </View>
                <Text style={s.qty}>× {item.quantity}</Text>
              </View>
              <View style={s.grid}>
                {item.selections.map((sel, j) => (
                  <View key={j} style={s.cell}>
                    <View style={[s.swatch, sel.hex ? { backgroundColor: sel.hex } : {}]} />
                    <View>
                      <Text style={s.cellLabel}>{sel.label}</Text>
                      <Text style={s.cellOption}>
                        {sel.option}
                        {sel.hex ? <Text style={s.cellHex}>{`  ${sel.hex}`}</Text> : null}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
              {item.configCode && <Text style={s.code}>{item.configCode}</Text>}
              {item.customNote !== undefined && (
                <Text style={s.note}>
                  Customer note: {item.customNote || "Complementary colours (studio's choice)"}
                </Text>
              )}
            </View>
          </View>
        ))}

        <View style={s.foot} fixed>
          <Text>minkeramikk.no — handmade ceramics</Text>
          <Text style={s.total}>
            Total: {doc.totalPieces} pieces
            {doc.totalWeightGrams != null
              ? ` · ${(doc.totalWeightGrams / 1000).toFixed(2)} kg${
                  doc.weightMissingLines > 0 ? " (partial)" : ""
                }`
              : ""}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
