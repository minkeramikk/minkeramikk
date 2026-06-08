import { describe, it, expect } from "vitest";
import {
  computeKpis,
  configuratorPathFromCode,
  filterOrders,
  mapOrderRow,
  orderMatchesQuery,
  orderSuppliers,
  orderTotal,
  summarizeItems,
  type AdminOrder,
  type AdminOrderItem,
  type RawOrderRow,
} from "./admin-orders";
import type { CodecDesign } from "@/lib/configurator/config-code";

function item(p: Partial<AdminOrderItem> = {}): AdminOrderItem {
  return {
    id: p.id ?? "i1",
    supplierId: p.supplierId ?? "sup-vietri",
    supplierName: p.supplierName ?? "Vietri",
    productName: p.productName ?? "Vietri Flat",
    priceCentsSnapshot: p.priceCentsSnapshot ?? 50000,
    currency: p.currency ?? "NOK",
    quantity: p.quantity ?? 1,
    configCode: p.configCode ?? null,
    configSnapshot: p.configSnapshot ?? null,
  };
}

function order(p: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: p.id ?? "o1",
    code: p.code ?? "MK-2606",
    customerName: p.customerName ?? "Ingrid Solberg",
    email: p.email ?? "ingrid.s@gmail.com",
    phone: p.phone ?? null,
    message: p.message ?? null,
    locale: p.locale ?? "no",
    status: p.status ?? "new",
    internalNotes: p.internalNotes ?? null,
    createdAt: p.createdAt ?? "2026-06-04T09:14:00Z",
    updatedAt: p.updatedAt ?? "2026-06-04T09:14:00Z",
    items: p.items ?? [item()],
  };
}

describe("mapOrderRow", () => {
  it("maps snake_case rows and tolerates an unknown status", () => {
    const raw: RawOrderRow = {
      id: "o1", code: "MK-1", customer_name: "A", email: "a@b.no", phone: null,
      message: null, locale: "no", status: "weird", internal_notes: null,
      created_at: "2026-06-04T09:14:00Z", updated_at: "2026-06-04T09:14:00Z",
      order_items: [
        { id: "i1", supplier_id: "s1", supplier_name_snapshot: "Vietri",
          product_name_snapshot: "Flat", price_cents_snapshot: 50000,
          currency_snapshot: "NOK", quantity: 2, config_code: "MK-A-K3",
          config_snapshot: { designName: "Blomster 1", selections: [] } },
      ],
    };
    const o = mapOrderRow(raw);
    expect(o.status).toBe("new"); // unknown → safe default
    expect(o.items[0].quantity).toBe(2);
    expect(o.items[0].configSnapshot?.designName).toBe("Blomster 1");
  });
});

describe("derivations", () => {
  it("summarizeItems lists qty × product", () => {
    const o = order({ items: [item({ quantity: 4 }), item({ productName: "Serveringsfat Stor", quantity: 1 })] });
    expect(summarizeItems(o.items)).toBe("4 × Vietri Flat, 1 × Serveringsfat Stor");
  });

  it("orderSuppliers is distinct, first-seen order", () => {
    const o = order({ items: [
      item({ supplierId: "a", supplierName: "Vietri" }),
      item({ supplierId: "b", supplierName: "Amalfi" }),
      item({ supplierId: "a", supplierName: "Vietri" }),
    ] });
    expect(orderSuppliers(o.items)).toEqual(["Vietri", "Amalfi"]);
  });

  it("orderTotal sums price × qty", () => {
    const o = order({ items: [item({ priceCentsSnapshot: 50000, quantity: 4 }), item({ priceCentsSnapshot: 130000, quantity: 1 })] });
    expect(orderTotal(o.items).amountCents).toBe(330000); // 3 300 kr
  });
});

describe("computeKpis", () => {
  it("counts buckets and sums open-order value only", () => {
    const orders = [
      order({ status: "new", items: [item({ priceCentsSnapshot: 100000, quantity: 1 })] }),
      order({ status: "contacted", items: [item({ priceCentsSnapshot: 50000, quantity: 2 })] }),
      order({ status: "in_production", items: [item({ priceCentsSnapshot: 30000, quantity: 1 })] }),
      order({ status: "delivered", items: [item({ priceCentsSnapshot: 999900, quantity: 1 })] }), // not open
      order({ status: "cancelled", items: [item({ priceCentsSnapshot: 999900, quantity: 1 })] }), // not open
    ];
    const k = computeKpis(orders);
    expect(k.newCount).toBe(1);
    expect(k.toContactCount).toBe(1);
    expect(k.inProductionCount).toBe(1);
    // 100000 + 100000 + 30000 = 230000 (delivered + cancelled excluded)
    expect(k.openValue.amountCents).toBe(230000);
  });
});

describe("filters", () => {
  const orders = [
    order({ id: "1", code: "MK-2606", customerName: "Ingrid", email: "ingrid@x.no", status: "new",
      items: [item({ supplierId: "vietri", supplierName: "Vietri", configCode: "MK-A-K3-D2" })] }),
    order({ id: "2", code: "MK-2605", customerName: "Lars", email: "lars@y.no", status: "contacted",
      items: [item({ supplierId: "amalfi", supplierName: "Amalfi", configCode: null })] }),
  ];

  it("filters by status", () => {
    expect(filterOrders(orders, { status: "new" }).map((o) => o.id)).toEqual(["1"]);
  });
  it("filters by supplier (any item)", () => {
    expect(filterOrders(orders, { supplierId: "amalfi" }).map((o) => o.id)).toEqual(["2"]);
  });
  it("text search hits name / email / code", () => {
    expect(filterOrders(orders, { q: "lars" }).map((o) => o.id)).toEqual(["2"]);
    expect(filterOrders(orders, { q: "MK-2606" }).map((o) => o.id)).toEqual(["1"]);
  });
  it("pasted config code finds the order via item config_code", () => {
    expect(orderMatchesQuery(orders[0], "mk-a-k3-d2")).toBe(true); // pasted as-is
    expect(filterOrders(orders, { q: "A-K3" }).map((o) => o.id)).toEqual(["1"]);
  });
  it("combines filters", () => {
    expect(filterOrders(orders, { status: "new", supplierId: "amalfi" })).toHaveLength(0);
  });
  it("ignores an invalid status filter", () => {
    expect(filterOrders(orders, { status: "bogus" })).toHaveLength(2);
  });
});

describe("configuratorPathFromCode", () => {
  const codec: CodecDesign[] = [
    {
      code: "A",
      slug: "blomster-1",
      categories: [
        { slug: "farge", optionCodeToId: { K3: "opt-k3" }, defaultOptionId: "opt-k3" },
      ],
    },
  ];

  it("decodes a code into a configurator deep-link", () => {
    const path = configuratorPathFromCode("MK-A-K3", codec);
    expect(path).toBe("/no/configurator?design=blomster-1&step=2&opt_farge=opt-k3");
  });
  it("returns null for a null code or unknown design", () => {
    expect(configuratorPathFromCode(null, codec)).toBeNull();
    expect(configuratorPathFromCode("MK-Z-K3", codec)).toBeNull();
  });
});
