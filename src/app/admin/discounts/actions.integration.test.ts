/**
 * R4-SCONTI Task 7 — integration tests for the discounts admin actions, against
 * the LINKED remote DB (needs migration 0032 AND its 0033 follow-up applied:
 * discount_tiers, discount_products, settings.quantity_discounts_enabled, and
 * a WHERE clause on the two replace_* RPCs).
 *
 * `.env.local` exists in this working tree, so a plain `describe.skipIf(!hasEnv)`
 * would RUN these tests unconditionally. Two migrations gate them, not one:
 * 0032 (the tables) may be applied while 0033 (the RPC fix) is not — that is
 * exactly the state Task 7 found staging in. A table-existence probe alone is
 * no longer enough: the tables exist, the describe would run, and both
 * write-path tests would fail with 21000 until 0033 lands. So we probe with an
 * inert round trip instead — read the current discount_products membership,
 * then call replace_discount_products with that exact same set back. Same
 * rows in, same rows out: nothing changes either way. It fails with 21000
 * (pg_safeupdate's "DELETE requires a WHERE clause") when 0033 is missing,
 * and it also fails (relation not found) when 0032 itself is missing — either
 * way, a declared skip, never a red run (lezione F07: never a silent skip,
 * always a declared one).
 *
 * This file is separate from designs/actions.integration.test.ts on purpose —
 * that one is a declared flake (remote-DB timeouts + a pre-existing TS2352) and
 * must not be touched.
 *
 * The staging DB this hits also serves the live public site (discount config is
 * read by the cart). afterAll restores exactly what beforeAll found — the
 * client's confirmed scale (4/5, 6/8, 8/10, 12/15, confirmed 27/8), whatever
 * quantity_discounts_enabled was before, and the original discount_products
 * membership — so a test run never leaves the shop's live discount config
 * rewritten.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient as createSb, type SupabaseClient } from "@supabase/supabase-js";

function loadEnv() {
  try {
    const raw = readFileSync(resolve(__dirname, "../../../../.env.local"), "utf8");
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

/** Inert round trip: writes back exactly what it just read, so a successful
 *  probe leaves no trace. Returns false (→ skip) on any error — missing table
 *  (0032 not applied) or 21000 (0033 not applied). */
async function probeFixApplied(): Promise<boolean> {
  const db = createSb(url!, serviceKey!, { auth: { persistSession: false } });
  const { data, error: selErr } = await db.from("discount_products").select("product_id");
  if (selErr) return false;
  const ids = (data ?? []).map((r) => r.product_id);
  const { error } = await db.rpc("replace_discount_products", { p_product_ids: ids });
  return !error;
}

const hasFix = hasEnv && (await probeFixApplied());

// The actions call createClient() (cookie-based) → swap for the service-role
// client, and getAdminUser() → always "authorized" for these tests.
const mockDb = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mockDb.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("@/lib/auth/admin", () => ({
  getAdminUser: async () => ({ email: "test@example.com" }),
}));

import { saveDiscountTiers, saveDiscountProducts } from "./actions";

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

describe.skipIf(!hasFix)("R4-SCONTI admin discount actions (needs 0033)", () => {
  let db: SupabaseClient;
  let originalTiers: { min_qty: number; pct: number; sort_order: number }[];
  let originalEnabled: boolean;
  let originalProductIds: string[];

  beforeAll(async () => {
    db = createSb(url!, serviceKey!, { auth: { persistSession: false } });
    mockDb.client = db;

    const [{ data: tiers }, { data: settings }, { data: products }] = await Promise.all([
      db.from("discount_tiers").select("min_qty, pct, sort_order").order("sort_order"),
      db.from("settings").select("quantity_discounts_enabled").eq("id", 1).maybeSingle(),
      db.from("discount_products").select("product_id"),
    ]);
    originalTiers = tiers ?? [];
    originalEnabled = settings?.quantity_discounts_enabled ?? false;
    originalProductIds = (products ?? []).map((p) => p.product_id);
  });

  afterAll(async () => {
    // Restore exactly what we found — the shared staging DB also serves the
    // live public site's cart. Never leave it rewritten.
    await db.rpc("replace_discount_tiers", { p_rows: originalTiers });
    await db.from("settings").update({ quantity_discounts_enabled: originalEnabled }).eq("id", 1);
    await db.rpc("replace_discount_products", { p_product_ids: originalProductIds });
  });

  it("saves a scale and reads it back sorted", async () => {
    const res = await saveDiscountTiers(
      {},
      fd({
        tiers: JSON.stringify([
          { min_qty: 8, pct: 10 },
          { min_qty: 4, pct: 5 },
        ]),
        enabled: "on",
      })
    );
    expect(res.error).toBeUndefined();
    const { data } = await db.from("discount_tiers").select("min_qty, pct").order("min_qty");
    expect(data).toEqual([
      { min_qty: 4, pct: 5 },
      { min_qty: 8, pct: 10 },
    ]);
  });

  it("refuses two steps at the same quantity", async () => {
    const res = await saveDiscountTiers(
      {},
      fd({
        tiers: JSON.stringify([
          { min_qty: 4, pct: 5 },
          { min_qty: 4, pct: 8 },
        ]),
        enabled: "on",
      })
    );
    expect(res.error).toMatch(/same quantity/);
  });

  it("refuses a percentage out of range", async () => {
    const res = await saveDiscountTiers(
      {},
      fd({ tiers: JSON.stringify([{ min_qty: 4, pct: 120 }]), enabled: "on" })
    );
    expect(res.error).toBeTruthy();
  });

  it("mode=all clears the inclusion table (no rows = everything included)", async () => {
    const res = await saveDiscountProducts({ error: null }, fd({ mode: "all" }));
    expect(res.error).toBeNull();
    const { count } = await db.from("discount_products").select("*", { count: "exact", head: true });
    expect(count).toBe(0);
  });
});
