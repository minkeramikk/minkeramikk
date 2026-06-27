import { describe, it, expect } from "vitest";
import { buildLabPdfDoc, buildLabPdfDocs } from "./lab-pdf-content";
import type { AdminOrder } from "./admin-orders";

const ORDER: AdminOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "MK-1042",
  customerName: "Kari Nordmann",
  email: "kari@example.no",
  phone: "+47 400 00 000",
  message: "please call before delivery",
  locale: "no",
  status: "new",
  internalNotes: "ring back",
  createdAt: "2026-06-08T09:30:00.000Z",
  updatedAt: "2026-06-08T09:30:00.000Z",
  items: [
    {
      id: "a1",
      supplierId: "sup-vietri",
      supplierName: "Vietri",
      productName: "Vietri Flat",
      priceCentsSnapshot: 50000,
      currency: "NOK",
      quantity: 4,
      configCode: "MK-D-A-Q",
      productImage: null,
      configSnapshot: {
        designName: "Krabbe",
        customNote: "brown dog with white spots",
        selections: [
          { label: "Farger", option: "Blå", hex: "#123456" },
          { label: "Kanter", option: "Gull", hex: "#ddaa33" },
        ],
      },
    },
    {
      id: "a2",
      supplierId: "sup-other",
      supplierName: "Amalfi Lab",
      productName: "Serveringsfat Stor",
      priceCentsSnapshot: 130000,
      currency: "NOK",
      quantity: 2,
      configCode: "MK-C-B",
      productImage: null,
      configSnapshot: { designName: "Amalfi Dyr", selections: [] },
    },
  ],
};

describe("buildLabPdfDoc", () => {
  it("builds one production-order doc per supplier (split, ADR 0007)", () => {
    const vietri = buildLabPdfDoc(ORDER, "sup-vietri");
    expect(vietri).toEqual({
      orderCode: "MK-1042",
      date: "2026-06-08",
      supplierName: "Vietri",
      totalPieces: 4,
      items: [
        {
          productName: "Vietri Flat",
          designName: "Krabbe",
          configCode: "MK-D-A-Q",
          quantity: 4,
          customNote: "brown dog with white spots",
          selections: [
            { label: "Farger", option: "Blå", hex: "#123456" },
            { label: "Kanter", option: "Gull", hex: "#ddaa33" },
          ],
        },
      ],
    });
  });

  it("returns null for a supplier not in the order", () => {
    expect(buildLabPdfDoc(ORDER, "sup-missing")).toBeNull();
  });

  it("produces one doc per supplier", () => {
    const docs = buildLabPdfDocs(ORDER);
    expect(docs.map((d) => d.supplierName).sort()).toEqual(["Amalfi Lab", "Vietri"]);
    expect(docs.reduce((n, d) => n + d.totalPieces, 0)).toBe(6);
  });

  it("contains NO customer PII", () => {
    const blob = JSON.stringify(buildLabPdfDocs(ORDER));
    for (const pii of [
      "Kari Nordmann",
      "kari@example.no",
      "+47 400 00 000",
      "please call before delivery",
      "ring back",
    ]) {
      expect(blob).not.toContain(pii);
    }
  });

  it("carries the customer note onto the lab item (R2-2b AC5)", () => {
    const doc = buildLabPdfDoc(ORDER, "sup-vietri")!;
    expect(doc.items[0].customNote).toBe("brown dog with white spots");
  });

  it("leaves customNote undefined when the snapshot has none", () => {
    const doc = buildLabPdfDoc(ORDER, "sup-other")!;
    expect(doc.items[0].customNote).toBeUndefined();
  });
});
