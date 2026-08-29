/**
 * R4-SCONTI Task 7 — integration tests for the discounts admin actions, against
 * the LINKED remote DB (needs migration 0032 AND its 0033 follow-up applied:
 * discount_tiers, discount_products, settings.quantity_discounts_enabled, and
 * a WHERE clause on the two replace_* RPCs).
 *
 * `.env.local` exists in this working tree, so `hasEnv` alone is not an opt-in.
 * This file mutates GLOBAL shop config — `quantity_discounts_enabled` and the
 * discount scale — on the one Supabase project there is, which also serves the
 * live public site (no separate staging project exists, see e2e/helpers.ts:85
 * onward). Unlike designs/actions.integration.test.ts (throwaway suppliers and
 * designs, safe to write unguarded), a run of THIS file that dies mid-test or
 * whose restore fails can leave the live shop with discounts switched on at a
 * two-step test scale, indefinitely. So the whole file — including the probe,
 * which itself performs a real DELETE+INSERT round trip — is gated on the same
 * explicit opt-in the e2e seeders require: `MK_E2E_SEED=1`.
 *
 * With that opt-in present, two migrations gate the DB-touching describe, not
 * one: 0032 (the tables) may be applied while 0033 (the RPC fix) is not — that
 * is exactly the state Task 7 found staging in. A table-existence probe alone
 * is not enough: the tables exist, the describe would run, and both
 * write-path tests would fail with 21000 until 0033 lands. So the probe does
 * an inert round trip instead — read the current discount_products
 * membership, then call replace_discount_products with that exact same set
 * back. Same rows in, same rows out: nothing changes either way. It reports
 * "not ready" on 42P01 (0032 missing) or 21000 (0033 missing) — a declared
 * skip either way (lezione F07: never a silent skip). Any OTHER error is
 * logged and treated as "ready", so the suite runs and fails loudly instead of
 * masquerading as "waiting for 0033" when the real problem is a rotated key, a
 * network blip, a re-pointed URL, or an RLS change.
 *
 * The two pure-validation tests (no DB call at all — actions.ts returns before
 * ever reaching createClient()) live in their own UNGATED describe below, so
 * they get real coverage on every machine and in CI, not just when someone
 * opts into seeding a live database.
 *
 * This file is separate from designs/actions.integration.test.ts on purpose —
 * that one is a declared flake (remote-DB timeouts + a pre-existing TS2352) and
 * must not be touched.
 *
 * afterAll restores exactly what beforeAll found — quantity_discounts_enabled
 * FIRST (so the shortest possible window has discounts on with a test scale),
 * then the client's confirmed scale (4/5, 6/8, 8/10, 12/15, confirmed 27/8),
 * then the original discount_products membership — and asserts every restore
 * succeeded, throwing loudly if one didn't. A restore that fails silently is
 * exactly the case that leaves the shop broken.
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
// Same switch the e2e seeders require (e2e/helpers.ts assertSeedingAllowed) —
// this file writes to the one real Supabase project there is, so an explicit
// opt-in is required before the probe (or anything else) touches it at all.
const canSeed = hasEnv && process.env.MK_E2E_SEED === "1";

/** Inert round trip: writes back exactly what it just read, so a successful
 *  probe leaves no trace. `false` → declared skip (0032 or 0033 missing).
 *  `true` on an unexpected error too, so the suite runs and fails loudly
 *  instead of skipping for the wrong reason. */
async function probeFixApplied(): Promise<boolean> {
  const db = createSb(url!, serviceKey!, { auth: { persistSession: false } });
  const { data, error: selErr } = await db.from("discount_products").select("product_id");
  if (selErr) {
    if (selErr.code === "42P01") return false; // 0032 not applied
    console.warn(
      "[R4-SCONTI integration] unexpected error reading discount_products — running the suite so it fails loudly instead of skipping for the wrong reason:",
      selErr
    );
    return true;
  }
  const ids = (data ?? []).map((r) => r.product_id);
  const { error } = await db.rpc("replace_discount_products", { p_product_ids: ids });
  if (error) {
    if (error.code === "21000") return false; // 0033 not applied (pg_safeupdate)
    console.warn(
      "[R4-SCONTI integration] unexpected error from replace_discount_products — running the suite so it fails loudly instead of skipping for the wrong reason:",
      error
    );
    return true;
  }
  return true;
}

// The probe itself performs a real DELETE+INSERT — it must never run without
// the opt-in, so `canSeed` gates it directly rather than being ANDed in after.
const hasFix = canSeed && (await probeFixApplied());

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

// ── pure validation — no DB, no opt-in required, always runs ────────────────
describe("R4-SCONTI saveDiscountTiers — validation (no DB call)", () => {
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
});

// ── DB-touching — needs MK_E2E_SEED=1 and migration 0033 applied ────────────
describe.skipIf(!hasFix)(
  "R4-SCONTI admin discount actions (set MK_E2E_SEED=1; needs 0033 applied)",
  () => {
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
      // Restore exactly what we found — the shared DB also serves the live
      // public site's cart. `enabled` FIRST: as soon as it lands, the shop is
      // safe even if a test scale is still sitting in discount_tiers for the
      // moment it takes the next two calls to run. Every restore's error is
      // checked and thrown loudly — a restore that fails silently is exactly
      // the case that leaves the shop broken.
      const { error: eErr } = await db
        .from("settings")
        .update({ quantity_discounts_enabled: originalEnabled })
        .eq("id", 1);
      const { error: tErr } = await db.rpc("replace_discount_tiers", { p_rows: originalTiers });
      const { error: pErr } = await db.rpc("replace_discount_products", {
        p_product_ids: originalProductIds,
      });

      const failures = [
        eErr && `settings.quantity_discounts_enabled: ${eErr.message}`,
        tErr && `discount_tiers: ${tErr.message}`,
        pErr && `discount_products: ${pErr.message}`,
      ].filter((f): f is string => Boolean(f));
      if (failures.length > 0) {
        throw new Error(
          `Failed to restore the shop's live discount config on staging — fix by hand: ${failures.join("; ")}`
        );
      }
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

    it("mode=all clears the inclusion table (no rows = everything included)", async () => {
      const res = await saveDiscountProducts({ error: null }, fd({ mode: "all" }));
      expect(res.error).toBeNull();
      const { count } = await db.from("discount_products").select("*", { count: "exact", head: true });
      expect(count).toBe(0);
    });
  }
);
