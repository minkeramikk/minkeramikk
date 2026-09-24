import { describe, it, expect } from "vitest";
import { addToCart, cartTotal, type NewCartLine } from "./cart";
import { freeShippingThreshold, shippingCost, shippingFor, shippingStatus } from "./shipping";
import { money } from "@/lib/money/money";

const THRESHOLD = money(200_000); // 2.000 NOK

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
  it("defaults the threshold to 2.000 NOK when the env var is unset", () => {
    expect(freeShippingThreshold).toEqual(money(200_000));
  });

  it("includes shipping exactly at the threshold", () => {
    expect(shippingStatus(money(200_000), THRESHOLD)).toEqual({ included: true });
  });

  it("is not included one øre below the threshold (1.999,99)", () => {
    expect(shippingStatus(money(199_999), THRESHOLD)).toEqual({
      included: false,
      missing: money(1),
    });
  });

  it("includes shipping above the threshold", () => {
    expect(shippingStatus(money(230_000), THRESHOLD)).toEqual({ included: true });
  });

  it("asks for the whole threshold on an empty cart", () => {
    expect(shippingStatus(cartTotal([]), THRESHOLD)).toEqual({
      included: false,
      missing: money(200_000),
    });
  });

  it("sums a multi-line cart before deciding", () => {
    const cart = addToCart(addToCart([], line(90_000, "a")), line(95_000, "b"));
    expect(shippingStatus(cartTotal(cart), THRESHOLD)).toEqual({
      included: false,
      missing: money(15_000),
    });

    const bigger = addToCart(cart, line(20_000, "c"));
    expect(shippingStatus(cartTotal(bigger), THRESHOLD)).toEqual({ included: true });
  });
});

describe("shippingFor", () => {
  it("defaults the cost to 200 NOK when the env var is unset", () => {
    expect(shippingCost).toEqual(money(20_000));
  });

  it("charges the cost one øre below the threshold (1.999,99)", () => {
    expect(shippingFor(money(199_999), THRESHOLD, shippingCost)).toEqual(money(20_000));
  });

  it("is free exactly at the threshold", () => {
    expect(shippingFor(money(200_000), THRESHOLD, shippingCost)).toEqual(money(0));
  });

  it("is free above the threshold", () => {
    expect(shippingFor(money(230_000), THRESHOLD, shippingCost)).toEqual(money(0));
  });

  it("defaults its threshold and cost arguments to the env-derived values", () => {
    expect(shippingFor(money(199_999))).toEqual(shippingCost);
    expect(shippingFor(money(200_000))).toEqual(money(0));
  });
});
