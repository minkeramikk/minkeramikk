/**
 * Integration test for createOrder (F05) against the LINKED remote DB.
 * Injects a fake Turnstile verifier and a mock email transport (no real sends,
 * AC5) + a service-role client. Skipped when Supabase env is absent (CI).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createOrder } from "./create";
import type { EmailMessage, EmailTransport } from "./email";

function loadEnv() {
  try {
    const raw = readFileSync(resolve(__dirname, "../../../.env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* CI */
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && serviceKey);

describe.skipIf(!hasEnv)("createOrder (integration)", () => {
  let db: SupabaseClient;
  let supplierId: string;
  const created: string[] = [];

  beforeAll(async () => {
    db = createClient(url!, serviceKey!, { auth: { persistSession: false } });
    const { data } = await db
      .from("suppliers")
      .select("id")
      .eq("name", "Vietri")
      .single();
    supplierId = data!.id;
  });

  afterAll(async () => {
    for (const code of created) await db.from("orders").delete().eq("code", code);
  });

  function mockTransport() {
    const sent: EmailMessage[] = [];
    const transport: EmailTransport = {
      async send(m) {
        sent.push(m);
      },
    };
    return { transport, sent };
  }

  const payload = () => ({
    customerName: "Integration Test",
    email: "itest@example.com",
    phone: "",
    message: "",
    locale: "no" as const,
    turnstileToken: "tok",
    items: [
      {
        supplierId,
        supplierName: "Vietri",
        productId: null,
        productName: "Vietri Flat",
        unitPriceCents: 50_000,
        currency: "NOK" as const,
        quantity: 2,
        configCode: "MK-A-A-A",
        configSnapshot: { designName: "Blomster 1" },
      },
    ],
  });

  it("creates an order with a sequence code + full snapshot, sends 2 emails", async () => {
    const { transport, sent } = mockTransport();
    const res = await createOrder(payload(), {
      verify: async () => true,
      transport,
      db,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.code).toMatch(/^MK-\d+$/);
    created.push(res.code);

    // customer + admin email
    expect(sent).toHaveLength(2);
    expect(sent[0].subject).toContain(res.code);

    // row persisted with snapshot
    const { data } = await db
      .from("orders")
      .select("status, locale, order_items(price_cents_snapshot, currency_snapshot, config_code, quantity)")
      .eq("code", res.code)
      .single();
    expect(data!.status).toBe("new");
    expect(data!.order_items).toHaveLength(1);
    expect(data!.order_items[0].price_cents_snapshot).toBe(50_000);
    expect(data!.order_items[0].config_code).toBe("MK-A-A-A");
  });

  it("two submits get two distinct codes (sequence, concurrency-safe)", async () => {
    const { transport } = mockTransport();
    const [a, b] = await Promise.all([
      createOrder(payload(), { verify: async () => true, transport, db }),
      createOrder(payload(), { verify: async () => true, transport, db }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok) created.push(a.code);
    if (b.ok) created.push(b.code);
    if (a.ok && b.ok) expect(a.code).not.toBe(b.code);
  });

  it("rejects a failed Turnstile with 400 and creates no order", async () => {
    const { transport, sent } = mockTransport();
    const res = await createOrder(payload(), {
      verify: async () => false,
      transport,
      db,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
  });
});
