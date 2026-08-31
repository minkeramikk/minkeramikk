import { describe, it, expect } from "vitest";
import { orderItemSchema, orderPayloadSchema, type OrderItemInput } from "./schema";
import { buildOrderItemRows, orderTotal, splitBySupplier } from "./build";
import { computeCartDiscount, EMPTY_CONFIG } from "@/lib/discounts/discount";

const item = (over: Partial<OrderItemInput> = {}): OrderItemInput => ({
  supplierId: "30a18ecc-0b97-4df4-a51d-aae79ee9c674",
  supplierName: "Vietri",
  productId: "11111111-1111-4111-8111-111111111111",
  productName: "Vietri Flat",
  unitPriceCents: 50_000,
  currency: "NOK",
  quantity: 1,
  configCode: "MK-A-A-A",
  configSnapshot: { designName: "Blomster 1" },
  ...over,
});

const noDiscount = computeCartDiscount([], EMPTY_CONFIG);
const keyByIndex = (_i: OrderItemInput, idx: number) => String(idx);

describe("buildOrderItemRows — complete snapshots", () => {
  it("maps every cart line to a full snapshot row (cents+currency, supplier, config)", () => {
    const rows = buildOrderItemRows([item({ quantity: 2 })], noDiscount, keyByIndex);
    expect(rows[0]).toEqual({
      supplier_id: "30a18ecc-0b97-4df4-a51d-aae79ee9c674",
      supplier_name_snapshot: "Vietri",
      product_id: "11111111-1111-4111-8111-111111111111",
      product_name_snapshot: "Vietri Flat",
      price_cents_snapshot: 50_000,
      currency_snapshot: "NOK",
      config_code: "MK-A-A-A",
      config_snapshot: { designName: "Blomster 1" },
      quantity: 2,
      discount_pct: null,
      discount_cents: 0,
      discount_source: null,
    });
  });

  it("keeps a null product_id (config-only line) and null snapshot", () => {
    const rows = buildOrderItemRows(
      [item({ productId: null, configSnapshot: null })],
      noDiscount,
      keyByIndex
    );
    expect(rows[0].product_id).toBeNull();
    expect(rows[0].config_snapshot).toBeNull();
  });
});

describe("splitBySupplier (ADR 0007, reused by F08)", () => {
  it("groups items per supplier preserving membership", () => {
    const aId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const bId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const a = item({ supplierId: aId, supplierName: "Vietri" });
    const b = item({ supplierId: bId, supplierName: "Amalfi" });
    const split = splitBySupplier([a, b, item({ supplierId: aId })]);
    expect(split.size).toBe(2);
    expect(split.get(aId)).toHaveLength(2);
    expect(split.get(bId)).toHaveLength(1);
  });
});

describe("orderTotal (Money, cents, never float)", () => {
  it("sums quantity × unit price in cents", () => {
    const total = orderTotal([item({ unitPriceCents: 50_000, quantity: 4 }), item({ unitPriceCents: 130_000, quantity: 1 })]);
    expect(total.amountCents).toBe(330_000);
    expect(total.currency).toBe("NOK");
  });
  it("empty order totals zero", () => {
    expect(orderTotal([]).amountCents).toBe(0);
  });
});

describe("orderPayloadSchema (shared client/server validation)", () => {
  const valid = {
    customerName: "Kari",
    email: "kari@example.no",
    phone: "",
    message: "",
    locale: "no" as const,
    turnstileToken: "tok",
    items: [item()],
  };

  it("accepts a well-formed payload", () => {
    expect(orderPayloadSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects an empty cart", () => {
    expect(orderPayloadSchema.safeParse({ ...valid, items: [] }).success).toBe(false);
  });
  it("rejects a bad email", () => {
    expect(orderPayloadSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });
  it("rejects a missing turnstile token", () => {
    expect(orderPayloadSchema.safeParse({ ...valid, turnstileToken: "" }).success).toBe(false);
  });
  it("rejects a float price", () => {
    const bad = { ...valid, items: [item({ unitPriceCents: 1.5 })] };
    expect(orderPayloadSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects an unknown currency", () => {
    const bad = { ...valid, items: [{ ...item(), currency: "USD" }] };
    expect(orderPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it("ignores a discount the client tries to inject — schema carries no such field", () => {
    // orderItemSchema has NO discount field at all: an injected discount_pct/
    // discountCents is stripped by zod before buildOrderItemRows ever sees it
    // (ADR 0022 — the server computes its own).
    const parsed = orderItemSchema.parse({
      ...item(),
      discount_pct: 90,
      discountCents: 999999,
    });
    expect(parsed).not.toHaveProperty("discount_pct");
    expect(parsed).not.toHaveProperty("discountCents");
  });
});

describe("buildOrderItemRows — discount snapshot (R4-SCONTI)", () => {
  const dItem = {
    supplierId: "11111111-1111-1111-1111-111111111111",
    supplierName: "Vietri",
    productId: "22222222-2222-2222-2222-222222222222",
    productName: "Deluxe tallerken",
    unitPriceCents: 74900,
    currency: "NOK" as const,
    quantity: 8,
    configCode: "MK-A-b1",
    configSnapshot: null,
  };

  it("writes the computed percentage, amount and source onto the row", () => {
    const discount = computeCartDiscount(
      [{ id: "k", productId: dItem.productId, unitPriceCents: 74900, currency: "NOK", quantity: 8 }],
      { ...EMPTY_CONFIG, tiersEnabled: true, tiers: [{ minQty: 8, pct: 10 }] }
    );
    const [row] = buildOrderItemRows([dItem], discount, () => "k");
    expect(row.price_cents_snapshot).toBe(74900); // the UNIT price, unchanged
    expect(row.discount_pct).toBe(10);
    expect(row.discount_cents).toBe(59920);
    expect(row.discount_source).toBe("tier");
  });

  it("an undiscounted line is pct NULL / cents 0 / source NULL (today's shape)", () => {
    const discount = computeCartDiscount(
      [{ id: "k", productId: dItem.productId, unitPriceCents: 74900, currency: "NOK", quantity: 1 }],
      EMPTY_CONFIG
    );
    const [row] = buildOrderItemRows([{ ...dItem, quantity: 1 }], discount, () => "k");
    expect(row.discount_pct).toBeNull();
    expect(row.discount_cents).toBe(0);
    expect(row.discount_source).toBeNull();
  });

  it("an undiscounted line NEVER serialises discount_pct as the number 0 (CHECK constraint trap)", () => {
    // migration 0032's CHECK is (discount_pct is null or (discount_pct > 0 and
    // discount_pct <= 100)) — a literal 0 aborts the whole order insert (23514).
    // toBeFalsy() would pass on 0 too; only toBeNull() catches the real bug.
    const discount = computeCartDiscount(
      [{ id: "k", productId: dItem.productId, unitPriceCents: 74900, currency: "NOK", quantity: 1 }],
      EMPTY_CONFIG
    );
    const [row] = buildOrderItemRows([{ ...dItem, quantity: 1 }], discount, () => "k");
    expect(row.discount_pct).toBeNull();
    expect(row.discount_pct).not.toBe(0);
  });
});
