import { describe, it, expect } from "vitest";
import { orderPayloadSchema, type OrderItemInput } from "./schema";
import { buildOrderItemRows, orderTotal, splitBySupplier } from "./build";

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

describe("buildOrderItemRows — complete snapshots", () => {
  it("maps every cart line to a full snapshot row (cents+currency, supplier, config)", () => {
    const rows = buildOrderItemRows([item({ quantity: 2 })]);
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
    });
  });

  it("keeps a null product_id (config-only line) and null snapshot", () => {
    const rows = buildOrderItemRows([item({ productId: null, configSnapshot: null })]);
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
});
