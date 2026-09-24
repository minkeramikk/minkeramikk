import { describe, it, expect } from "vitest";
import { toKitLines, type KitProduct } from "./kit-lines";

const DESIGN = { supplierId: "s1", supplierName: "Supplier" };

const PRODUCTS: KitProduct[] = [
  {
    id: "p1",
    slug: "deep-plate",
    nameNo: "Dyp tallerken",
    nameEn: "Deep plate",
    priceCents: 10000,
    currency: "NOK",
    image: "products/deep.png",
    pieces: 1,
  },
];

const assetUrlOf = (p: string) => `https://cdn.test/${p}`;

describe("toKitLines", () => {
  it("builds an unpainted line with the live price", () => {
    const { lines, unavailable } = toKitLines(
      [{ productSlug: "deep-plate", qty: 6 }],
      DESIGN,
      PRODUCTS,
      assetUrlOf
    );
    expect(unavailable).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      productId: "p1",
      quantity: 6,
      unitPriceCents: 10000,
      currency: "NOK",
      configCode: null,
      configSnapshot: null,
      productSlug: "deep-plate",
      pieces: 1,
    });
    expect(lines[0].layers).toBeUndefined();
    expect(lines[0].plateImage).toBe("https://cdn.test/products/deep.png");
  });

  it("counts an unknown slug as unavailable", () => {
    const { lines, unavailable } = toKitLines(
      [
        { productSlug: "deep-plate", qty: 1 },
        { productSlug: "ghost", qty: 2 },
      ],
      DESIGN,
      PRODUCTS,
      assetUrlOf
    );
    expect(lines).toHaveLength(1);
    expect(unavailable).toBe(1);
  });

  it("keeps the entry quantity", () => {
    const { lines } = toKitLines(
      [{ productSlug: "deep-plate", qty: 4 }],
      DESIGN,
      PRODUCTS,
      assetUrlOf
    );
    expect(lines[0].quantity).toBe(4);
  });
});
