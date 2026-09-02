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
import { describe, it, expect, vi, afterEach } from "vitest";
import * as pdfModule from "./customer-pdf.server";
import { createOrder } from "./create";
import type { OrderItemInput } from "./schema";
import type { OrderItemRow } from "./build";
import { EMPTY_CONFIG, type DiscountConfig } from "@/lib/discounts/discount";
import type { EmailMessage, EmailTransport } from "./email";

const PLATE = "11111111-1111-4111-8111-111111111111";
const BOAT = "22222222-2222-4222-8222-222222222222";
const RULE_ID = "33333333-3333-4333-8333-333333333333";
const UNKNOWN_RULE_ID = "44444444-4444-4444-8444-444444444444";

const ORDER_ID = "0f9c1e2a-1111-4222-8333-444455556666";

afterEach(() => vi.restoreAllMocks());

/** A mock service-role client. `.rpc()` is what creates the order (and every
 *  p_items call it receives is captured for inspection); `.from()` covers the
 *  one read R4-PDF-CLIENTE added — create_order returns the CODE, and the
 *  summary object is named after the order's uuid. */
function makeMockDb() {
  const calls: { p_items: OrderItemRow[] }[] = [];
  const db = {
    rpc: async (_fn: string, args: { p_items: OrderItemRow[] }) => {
      calls.push(args);
      return { data: "MK-1", error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { id: ORDER_ID }, error: null }) }),
      }),
    }),
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

/** A two-item payload: the PLATE trigger line (still in the cart, satisfying
 *  RULE_ID's triggerMinQty:1) plus a deal line built from item overrides —
 *  what a real "accept the suggestion" cart looks like. Needed since the
 *  fix-wave dealPct() now re-checks the trigger group is still met, which a
 *  deal-line-only payload (no trigger line at all) can never satisfy. */
function payloadWithTriggerAnd(itemOverrides: Partial<OrderItemInput>) {
  const base = payloadWith(itemOverrides);
  return {
    ...base,
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
      },
      ...base.items,
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
    // Trigger line (plate) must still be in the payload — fix-wave I1/I2:
    // dealPct() now re-checks the trigger group is still met, not just the %.
    const { db, calls } = makeMockDb();
    const res = await createOrder(
      payloadWithTriggerAnd({ productId: BOAT, appliedRuleId: RULE_ID }),
      { config: fixedRuleConfig, db, verify: async () => true, transport: mockTransport() }
    );
    expect(res.ok).toBe(true);
    const rows = capturedRowsFrom(calls);
    expect(rows[1].discount_pct).toBe(15);
    expect(rows[1].discount_source).toBe("deal");
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

  it("D7 — a rule id unknown to an ENABLED config (deleted between add-to-cart and checkout) gives no discount, never a literal 0", async () => {
    // EMPTY_CONFIG in the test above only exercises dealPct's automationsEnabled
    // early return; this exercises the `if (!rule) return 0` branch ADR 0023
    // describes explicitly (a rule deleted after the line was added).
    const { db, calls } = makeMockDb();
    const res = await createOrder(
      payloadWithTriggerAnd({ productId: BOAT, appliedRuleId: UNKNOWN_RULE_ID }),
      { config: fixedRuleConfig, db, verify: async () => true, transport: mockTransport() }
    );
    expect(res.ok).toBe(true);
    const rows = capturedRowsFrom(calls);
    // toBeFalsy()/not.toBe(0) alone would also pass a literal 0, which aborts
    // the whole insert under migration 0032's CHECK — toBeNull() is the point.
    expect(rows[1].discount_pct).toBeNull();
    expect(rows[1].discount_pct).not.toBe(0);
  });

  it("a fixed deal survives the tiers being switched off", async () => {
    const { db, calls } = makeMockDb();
    const config: DiscountConfig = { ...fixedRuleConfig, tiersEnabled: false };
    const res = await createOrder(
      payloadWithTriggerAnd({ productId: BOAT, appliedRuleId: RULE_ID }),
      { config, db, verify: async () => true, transport: mockTransport() }
    );
    expect(res.ok).toBe(true);
    const rows = capturedRowsFrom(calls);
    expect(rows[1].discount_pct).toBe(15);
    expect(rows[1].discount_source).toBe("deal");
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

describe("R4-MAIL-JOURNEY §E — the emails leave AFTER the response", () => {
  it("createOrder sends nothing by itself; the thunk does", async () => {
    const { db } = makeMockDb();
    const sent: EmailMessage[] = [];
    const transport: EmailTransport = { async send(m) { sent.push(m); } };

    const res = await createOrder(
      payloadWith({}),
      { config: EMPTY_CONFIG, db, verify: async () => true, transport }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // nothing yet: the customer already has their response
    expect(sent).toHaveLength(0);

    await res.sendEmails();
    // customer + admin
    expect(sent).toHaveLength(2);
  });

  it("a failing transport never escapes the thunk — a persisted order stays persisted", async () => {
    const { db } = makeMockDb();
    let calls = 0;
    const transport: EmailTransport = {
      async send() {
        calls++;
        throw new Error("resend is down");
      },
    };
    const res = await createOrder(
      payloadWith({}),
      { config: EMPTY_CONFIG, db, verify: async () => true, transport }
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    await expect(res.sendEmails()).resolves.toBeUndefined();
    // the send was actually attempted (and its failure swallowed) — not just
    // never invoked, which would also satisfy the assertion above
    expect(calls).toBe(1);
  });
});

describe("R4-PDF-CLIENTE — il riepilogo nel lavoro differito", () => {
  it("l'allegato va sulla mail del CLIENTE e non su quella admin", async () => {
    const { db } = makeMockDb();
    const sent: EmailMessage[] = [];
    const transport: EmailTransport = { async send(m) { sent.push(m); } };
    vi.spyOn(pdfModule, "renderAndStoreCustomerPdf").mockResolvedValue({
      pdf: Buffer.from("%PDF-1.4 fake"),
      stored: true,
    });

    const res = await createOrder(payloadWith({}), {
      config: EMPTY_CONFIG, db, verify: async () => true, transport,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    await res.sendEmails();

    expect(sent).toHaveLength(2);
    const [customer, admin] = sent;
    expect(customer.attachments?.[0].filename).toBe("bestilling-MK-1.pdf");
    expect(admin.attachments).toBeUndefined();
  });

  it("un upload fallito NON costa l'allegato: i byte ci sono comunque", async () => {
    // Rendering e archiviazione sono due esiti indipendenti. Il rendering è la
    // parte costosa ed è riuscita: perdere l'allegato perché lo Storage ha
    // singhiozzato sarebbe pagare due volte lo stesso errore.
    const { db } = makeMockDb();
    const sent: EmailMessage[] = [];
    vi.spyOn(pdfModule, "renderAndStoreCustomerPdf").mockResolvedValue({
      pdf: Buffer.from("%PDF-1.4 fake"),
      stored: false,
    });
    const res = await createOrder(payloadWith({}), {
      config: EMPTY_CONFIG, db, verify: async () => true,
      transport: { async send(m) { sent.push(m); } },
    });
    if (!res.ok) return;
    await res.sendEmails();
    expect(sent[0].attachments).toHaveLength(1);
  });

  it("AC5 — se la generazione LANCIA, l'ordine e le mail proseguono senza allegato", async () => {
    const { db } = makeMockDb();
    const sent: EmailMessage[] = [];
    vi.spyOn(pdfModule, "renderAndStoreCustomerPdf").mockRejectedValue(new Error("sharp exploded"));
    const res = await createOrder(payloadWith({}), {
      config: EMPTY_CONFIG, db, verify: async () => true,
      transport: { async send(m) { sent.push(m); } },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    await expect(res.sendEmails()).resolves.toBeUndefined();
    expect(sent).toHaveLength(2);
    expect(sent[0].attachments).toBeUndefined();
  });
});
