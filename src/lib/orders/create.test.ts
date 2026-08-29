/**
 * Unit tests for createOrder's discount resolution (R4-SCONTI, Task 12).
 *
 * Task 5 wired `deps.config` through createOrder so the SERVER re-derives a
 * cart line's discount from the DB config it loaded, keyed on the opaque
 * `appliedRuleId` the payload carries — never from a price or percentage the
 * browser might send. These tests pin that: no real DB, no Turnstile, no
 * email network I/O — everything is injected, so they run everywhere
 * (unlike create.integration.test.ts, which needs the linked staging DB).
 */
import { describe, it, expect } from "vitest";
import { createOrder } from "./create";
import type { OrderItemInput } from "./schema";
import type { OrderItemRow } from "./build";
import { EMPTY_CONFIG, type DiscountConfig } from "@/lib/discounts/discount";
import type { EmailMessage, EmailTransport } from "./email";

const PLATE = "11111111-1111-4111-8111-111111111111";
const BOAT = "22222222-2222-4222-8222-222222222222";
const RULE_ID = "33333333-3333-4333-8333-333333333333";
const UNKNOWN_RULE_ID = "44444444-4444-4444-8444-444444444444";

/** A mock service-role client: only `.rpc()` is exercised by createOrder, and
 *  every p_items call it receives is captured for inspection. */
function makeMockDb() {
  const calls: { p_items: OrderItemRow[] }[] = [];
  const db = {
    rpc: async (_fn: string, args: { p_items: OrderItemRow[] }) => {
      calls.push(args);
      return { data: "MK-1", error: null };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { db, calls };
}

/** No real send, no Resend — adapted from create.integration.test.ts's mockTransport. */
function mockTransport(): EmailTransport {
  const sent: EmailMessage[] = [];
  return { async send(m) { sent.push(m); } };
}

/** A single-item order payload; overrides land on that one item so a test can
 *  set e.g. productId/appliedRuleId without repeating the rest. */
function payloadWith(itemOverrides: Partial<OrderItemInput>) {
  return {
    customerName: "Test Customer",
    email: "test@example.com",
    phone: "",
    message: "",
    locale: "no" as const,
    turnstileToken: "tok",
    items: [
      {
        supplierId: "30a18ecc-0b97-4df4-a51d-aae79ee9c674",
        supplierName: "Vietri",
        productId: PLATE,
        productName: "Vietri Flat",
        unitPriceCents: 50_000,
        currency: "NOK" as const,
        quantity: 1,
        configCode: "MK-A-A-A",
        configSnapshot: { designName: "Blomster 1" },
        ...itemOverrides,
      },
    ],
  };
}

/** Reads the p_items rows the RPC would have received off the mock's captured calls. */
function capturedRowsFrom(calls: { p_items: OrderItemRow[] }[]): OrderItemRow[] {
  return calls[0].p_items;
}

const fixedRuleConfig: DiscountConfig = {
  ...EMPTY_CONFIG,
  automationsEnabled: true,
  rules: [
    {
      id: RULE_ID,
      name: "plate -> boat",
      triggerProductIds: [PLATE],
      triggerMinQty: 1,
      suggestedProductId: BOAT,
      suggestedQty: 1,
      discountMode: "fixed",
      discountPct: 15,
    },
  ],
};

describe("createOrder — the server resolves a deal from the DB config, never the payload", () => {
  it("a deal line is snapshotted with the RULE's percentage, not the browser's", async () => {
    const { db, calls } = makeMockDb();
    const res = await createOrder(
      payloadWith({ productId: BOAT, appliedRuleId: RULE_ID }),
      { config: fixedRuleConfig, db, verify: async () => true, transport: mockTransport() }
    );
    expect(res.ok).toBe(true);
    const rows = capturedRowsFrom(calls);
    expect(rows[0].discount_pct).toBe(15);
    expect(rows[0].discount_source).toBe("deal");
  });

  it("an unknown or disabled rule id gives no discount, not a crash — and never a literal 0 (CHECK constraint trap)", async () => {
    const { db, calls } = makeMockDb();
    const res = await createOrder(
      payloadWith({ productId: BOAT, appliedRuleId: UNKNOWN_RULE_ID }),
      { config: EMPTY_CONFIG, db, verify: async () => true, transport: mockTransport() }
    );
    expect(res.ok).toBe(true);
    const rows = capturedRowsFrom(calls);
    // toBeFalsy() would also pass on a literal 0, which aborts the whole
    // insert under migration 0032's CHECK — only toBeNull() catches that.
    expect(rows[0].discount_pct).toBeNull();
    expect(rows[0].discount_pct).not.toBe(0);
  });

  it("a fixed deal survives the tiers being switched off", async () => {
    const { db, calls } = makeMockDb();
    const config: DiscountConfig = { ...fixedRuleConfig, tiersEnabled: false };
    const res = await createOrder(
      payloadWith({ productId: BOAT, appliedRuleId: RULE_ID }),
      { config, db, verify: async () => true, transport: mockTransport() }
    );
    expect(res.ok).toBe(true);
    const rows = capturedRowsFrom(calls);
    expect(rows[0].discount_pct).toBe(15);
    expect(rows[0].discount_source).toBe("deal");
  });

  it("a rule that resolves to 'inherited' with tiers off yields no discount", async () => {
    const { db, calls } = makeMockDb();
    const config: DiscountConfig = {
      ...EMPTY_CONFIG,
      automationsEnabled: true,
      tiersEnabled: false,
      rules: [
        {
          id: RULE_ID,
          name: "plate -> boat (inherited)",
          triggerProductIds: [PLATE],
          triggerMinQty: 1,
          suggestedProductId: BOAT,
          suggestedQty: 1,
          discountMode: "inherited",
          discountPct: null,
        },
      ],
    };
    const res = await createOrder(
      payloadWith({ productId: BOAT, appliedRuleId: RULE_ID }),
      { config, db, verify: async () => true, transport: mockTransport() }
    );
    expect(res.ok).toBe(true);
    const rows = capturedRowsFrom(calls);
    expect(rows[0].discount_pct).toBeNull();
  });
});
