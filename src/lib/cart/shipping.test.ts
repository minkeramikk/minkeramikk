import { describe, it, expect } from "vitest";
import { addToCart, cartTotal, type NewCartLine } from "./cart";
import { freeShippingThreshold, shippingStatus } from "./shipping";
import { money } from "@/lib/money/money";

const THRESHOLD = money(100_000); // 1.000 NOK

const line = (unitPriceCents: number, id: string): NewCartLine => ({
  productId: id,
  productNameNo: id,
  productNameEn: id,
  supplierId: "s-vietri",
  supplierName: "Vietri",
  unitPriceCents,
  currency: "NOK",
  configCode: `design=blomster-1&p=${id}`,
  configSnapshot: null,
});

describe("shippingStatus", () => {
  it("defaults the threshold to 1.000 NOK when the env var is unset", () => {
    expect(freeShippingThreshold).toEqual(money(100_000));
  });

  it("includes shipping exactly at the threshold", () => {
    expect(shippingStatus(money(100_000), THRESHOLD)).toEqual({ included: true });
  });

  it("is not included one øre below the threshold (999,99)", () => {
    expect(shippingStatus(money(99_999), THRESHOLD)).toEqual({
      included: false,
      missing: money(1),
    });
  });

  it("includes shipping above the threshold", () => {
    expect(shippingStatus(money(130_000), THRESHOLD)).toEqual({ included: true });
  });

  it("asks for the whole threshold on an empty cart", () => {
    expect(shippingStatus(cartTotal([]), THRESHOLD)).toEqual({
      included: false,
      missing: money(100_000),
    });
  });

  it("sums a multi-line cart before deciding", () => {
    const cart = addToCart(addToCart([], line(40_000, "a")), line(45_000, "b"));
    expect(shippingStatus(cartTotal(cart), THRESHOLD)).toEqual({
      included: false,
      missing: money(15_000),
    });

    const bigger = addToCart(cart, line(20_000, "c"));
    expect(shippingStatus(cartTotal(bigger), THRESHOLD)).toEqual({ included: true });
  });
});
