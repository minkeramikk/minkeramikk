import { describe, it, expect } from "vitest";
import { buildLabPdfDoc, buildLabPdfDocs } from "./lab-pdf-content";
import type { AdminOrder } from "./admin-orders";

const ORDER: AdminOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "MK-1042",
  customerName: "Kari Nordmann",
  email: "kari@example.no",
  phone: "+47 400 00 000",
  address: "Storgata 1",
  zipcode: "0155",
  country: "Norway",
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
      productSlug: null,
      productWeightGrams: 800,
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
      productSlug: null,
      productWeightGrams: null,
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
      shipTo: {
        name: "Kari Nordmann",
        email: "kari@example.no",
        address: "Storgata 1",
        zipcode: "0155",
        country: "Norway",
        phone: "+47 400 00 000",
      },
      totalPieces: 4,
      totalWeightGrams: 3200,
      weightMissingLines: 0,
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

  it("includes the customer ship-to (with email) but not internal notes", () => {
    const blob = JSON.stringify(buildLabPdfDocs(ORDER));
    // ship-to: the workshop ships to (and can contact) the customer
    for (const shown of [
      "Kari Nordmann",
      "kari@example.no",
      "Storgata 1",
      "0155",
      "Norway",
      "+47 400 00 000",
    ]) {
      expect(blob).toContain(shown);
    }
    // customer message and internal notes stay out of the workshop doc
    for (const hidden of ["please call before delivery", "ring back"]) {
      expect(blob).not.toContain(hidden);
    }
  });

  it("totals shipping weight = Σ(qty × unit weight), skipping lines without one", () => {
    const vietri = buildLabPdfDoc(ORDER, "sup-vietri")!;
    expect(vietri.totalWeightGrams).toBe(3200); // 4 × 800 g
    expect(vietri.weightMissingLines).toBe(0);

    const other = buildLabPdfDoc(ORDER, "sup-other")!;
    expect(other.totalWeightGrams).toBeNull(); // that line has no weight
    expect(other.weightMissingLines).toBe(1);
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
