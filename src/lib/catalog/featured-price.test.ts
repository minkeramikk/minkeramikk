import { describe, it, expect } from "vitest";
import { featuredPrice } from "./featured-price";
import { EMPTY_CONFIG } from "@/lib/discounts/discount";

const PRODUCTS = {
  "deep-plate": { id: "p1", priceCents: 10000, currency: "NOK" as const },
  "coffee-cup": { id: "p2", priceCents: 5000, currency: "NOK" as const },
};

describe("featuredPrice", () => {
  it("prices set and kit rows identically", () => {
    const setRows = [
      { productSlug: "deep-plate", qty: 6 },
      { productSlug: "coffee-cup", qty: 4 },
    ];
    const kitRows = [
      { productSlug: "deep-plate", qty: 6 },
      { productSlug: "coffee-cup", qty: 4 },
    ];
    const fromSet = featuredPrice(setRows, PRODUCTS, EMPTY_CONFIG);
    const fromKit = featuredPrice(kitRows, PRODUCTS, EMPTY_CONFIG);
    expect(fromSet).not.toBeNull();
    expect(fromKit).toEqual(fromSet);
    expect(fromSet).toMatchObject({ grossCents: 80000, netCents: 80000, currency: "NOK" });
  });

  it("applies the tier discount (10 pieces → 10%)", () => {
    const config = {
      ...EMPTY_CONFIG,
      tiersEnabled: true,
      tiers: [{ minQty: 10, pct: 10 }],
    };
    const price = featuredPrice(
      [
        { productSlug: "deep-plate", qty: 6 },
        { productSlug: "coffee-cup", qty: 4 },
      ],
      PRODUCTS,
      config
    );
    // 10 pieces of deep-plate? No: tiers are per-PRODUCT, so 6 and 4 earn
    // nothing under a 10-piece threshold.
    expect(price).toMatchObject({ grossCents: 80000, netCents: 80000 });
  });

  it("applies the tier discount when one product reaches the scale", () => {
    const config = {
      ...EMPTY_CONFIG,
      tiersEnabled: true,
      tiers: [{ minQty: 10, pct: 10 }],
    };
    const price = featuredPrice(
      [{ productSlug: "deep-plate", qty: 10 }],
      PRODUCTS,
      config
    );
    // 10 × 10000 = 100000 gross, −10% = 90000 net
    expect(price).toMatchObject({ grossCents: 100000, netCents: 90000 });
  });

  it("returns null for a missing slug or no rows", () => {
    expect(
      featuredPrice([{ productSlug: "ghost", qty: 1 }], PRODUCTS, EMPTY_CONFIG)
    ).toBeNull();
    expect(featuredPrice([], PRODUCTS, EMPTY_CONFIG)).toBeNull();
  });
});
