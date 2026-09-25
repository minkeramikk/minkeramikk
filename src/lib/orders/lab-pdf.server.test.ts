/**
 * R5-QA2 T3 — `englishNames` unit tests. `getDesignDetail` is injected (same
 * deps-injection convention as `createOrder`, see create.test.ts) so this runs
 * with no real DB, no Supabase client, no network: `encodeConfigCode`/
 * `decodeConfigCode`/`toCodecDesign` are the real, pure functions.
 */
import { describe, it, expect } from "vitest";
import { englishNames } from "./lab-pdf.server";
import {
  encodeConfigCode,
  toCodecDesign,
} from "@/lib/configurator/config-code";
import type { DesignDetail } from "@/lib/catalog/design-options";
import type { AdminOrder, AdminOrderItem } from "./admin-orders";

const DESIGN: DesignDetail = {
  id: "d1",
  slug: "krabbe",
  code: "K",
  name: "Krabbe",
  nameNo: "Krabbe",
  nameEn: "Crab",
  acceptsCustomNotes: false,
  acceptsCustomText: false,
  textPositions: [],
  descriptionStep2No: null,
  descriptionStep2En: null,
  images: [],
  categories: [
    {
      id: "c1",
      slug: "farger",
      labelNo: "Farger",
      labelEn: "Colours",
      kind: "color",
      layerSlot: "base",
      syncGroup: null,
      options: [
        {
          id: "o1",
          code: "A",
          name: "Blå",
          image: null,
          hex: "#123456",
          layerImage: null,
          isDefault: true,
        },
      ],
    },
  ],
};

function item(overrides: Partial<AdminOrderItem> = {}): AdminOrderItem {
  return {
    id: "i1",
    supplierId: "sup1",
    supplierName: "Vietri",
    productName: "Flatt fat",
    priceCentsSnapshot: 50000,
    currency: "NOK",
    quantity: 1,
    configCode: null,
    configSnapshot: null,
    productImage: null,
    productSlug: null,
    productNameEn: null,
    productWeightGrams: null,
    discountPct: null,
    discountCents: 0,
    discountSource: null,
    ...overrides,
  };
}

function order(items: AdminOrderItem[]): AdminOrder {
  return {
    id: "o1",
    code: "MK-1",
    customerName: "Kari Nordmann",
    email: "kari@example.no",
    phone: null,
    address: null,
    zipcode: null,
    city: null,
    country: null,
    message: null,
    locale: "no",
    status: "new",
    internalNotes: null,
    paidAt: null,
    trackingCode: null,
    discountRatifiedAt: null,
    createdAt: "2026-06-08T09:30:00.000Z",
    updatedAt: "2026-06-08T09:30:00.000Z",
    items,
  };
}

describe("englishNames", () => {
  it("resolves product, design and option names in English for a NO-snapshotted order", async () => {
    const codec = toCodecDesign(DESIGN)!;
    const configCode = encodeConfigCode(codec, { farger: "o1" });

    const seeded = item({
      productName: "Flatt fat", // frozen NO snapshot
      productNameEn: "Flat Dish", // live join, product still exists
      configCode,
      configSnapshot: {
        designSlug: "krabbe",
        designName: "Krabbe",
        selections: [{ label: "Farger", option: "Blå", hex: "#123456" }],
      },
    });

    const result = await englishNames(order([seeded]), {
      getDesignDetail: async (slug) => (slug === "krabbe" ? DESIGN : null),
    });

    expect(result.items[0].productName).toBe("Flat Dish");
    expect(result.items[0].configSnapshot?.designName).toBe("Crab");
    expect(result.items[0].configSnapshot?.selections).toEqual([
      { label: "Colours", option: "Blå", hex: "#123456" },
    ]);
  });

  it("falls back to the frozen snapshot when product_id is null (product deleted)", async () => {
    const seeded = item({
      productName: "Flatt fat",
      productNameEn: null, // product_id NULL → the live join never resolved a name
      configCode: null,
      configSnapshot: {
        designSlug: "krabbe",
        designName: "Krabbe",
        selections: [{ label: "Farger", option: "Blå", hex: "#123456" }],
      },
    });

    const result = await englishNames(order([seeded]), {
      getDesignDetail: async () => null, // design gone too, for good measure
    });

    expect(result.items[0].productName).toBe("Flatt fat");
    expect(result.items[0].configSnapshot?.designName).toBe("Krabbe");
    expect(result.items[0].configSnapshot?.selections).toEqual([
      { label: "Farger", option: "Blå", hex: "#123456" },
    ]);
  });
});
