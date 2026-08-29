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

/** R4-SCONTI Task 14 — migration 0034 (discount_rules, discount_rule_products)
 *  is a separate, later migration from 0032/0033 above and has NOT been
 *  applied to any database at the time this file was written. `42P01` → a
 *  declared skip (lezione F07: never a silent skip); any other error is
 *  logged and treated as "ready" so the suite fails loudly instead of
 *  skipping for the wrong reason. */
async function probeRulesApplied(): Promise<boolean> {
  const db = createSb(url!, serviceKey!, { auth: { persistSession: false } });
  const { error } = await db.from("discount_rules").select("id").limit(1);
  if (error) {
    if (error.code === "42P01") return false; // 0034 not applied
    console.warn(
      "[R4-SCONTI integration] unexpected error reading discount_rules — running the suite so it fails loudly instead of skipping for the wrong reason:",
      error
    );
    return true;
  }
  return true;
}
const hasRules = canSeed && (await probeRulesApplied());

// The actions call createClient() (cookie-based) → swap for the service-role
// client, and getAdminUser() → always "authorized" for these tests.
const mockDb = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mockDb.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("@/lib/auth/admin", () => ({
  getAdminUser: async () => ({ email: "test@example.com" }),
}));

import {
  saveDiscountTiers,
  saveDiscountProducts,
  saveDiscountRule,
  deleteDiscountRule,
} from "./actions";
import { suggestedSharesSupplier } from "@/lib/discounts/discount";

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

// R4-SCONTI Task 14 — dummy v4-shaped uuids for the pure-validation tests below.
// None of these need to reference real rows: every test that uses them fails
// zod validation before saveDiscountRule ever calls createClient(), so no FK
// is ever touched.
const PROD_A = "11111111-1111-4111-8111-111111111111";
const PROD_B = "22222222-2222-4222-8222-222222222222";
const SUP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

// R4-SCONTI Task 14 — saveDiscountRule's four refusals are pure logic that
// return before createClient() is ever called (Task 7 learned this the hard
// way: its validation tests sat behind the DB gate and covered nothing). No
// env vars, no MK_E2E_SEED — these run everywhere, always.
describe("R4-SCONTI saveDiscountRule — validation (no DB call)", () => {
  it("refuses a fixed rule with no percentage", async () => {
    const res = await saveDiscountRule(
      {},
      fd({
        name: "Fixed no pct",
        enabled: "on",
        triggerMinQty: "2",
        triggerProductIds: JSON.stringify([PROD_A]),
        suggestedProductId: PROD_B,
        suggestedQty: "1",
        discountMode: "fixed",
        discountPct: "",
      })
    );
    expect(res.error).toMatch(/percentage/i);
  });

  // Review round 1, Important 1: a fractional percentage is REFUSED, not
  // rounded — silently turning an admin's "15.6" into 16 would change a
  // commercial decision without telling them. Pure (fails at the zod layer,
  // no DB), so this replaces the DB-gated round-trip test that would have
  // become a guaranteed failure the moment 0034 lands.
  it("refuses a fractional percentage on a fixed rule", async () => {
    const res = await saveDiscountRule(
      {},
      fd({
        name: "Fractional pct",
        enabled: "on",
        triggerMinQty: "2",
        triggerProductIds: JSON.stringify([PROD_A]),
        suggestedProductId: PROD_B,
        suggestedQty: "1",
        discountMode: "fixed",
        discountPct: "15.6",
      })
    );
    expect(res.error).toMatch(/whole number/i);
  });

  // C2 — the regression the TL caught in review. Without the z.preprocess fix
  // in actions.ts, z.coerce.number() turns "" into 0 and min(1) rejects it
  // with a "percentage" error — even though this rule is refused for an
  // UNRELATED reason (self-suggestion). Proves the empty field never reaches
  // the number rules as 0.
  it("does not misreport an empty percentage as invalid on a non-fixed rule", async () => {
    const res = await saveDiscountRule(
      {},
      fd({
        name: "Inherited self-suggest",
        enabled: "on",
        triggerMinQty: "2",
        triggerProductIds: JSON.stringify([PROD_A]),
        suggestedProductId: PROD_A, // trips the self-suggest refusal instead
        suggestedQty: "1",
        discountMode: "inherited",
        discountPct: "",
      })
    );
    expect(res.error).toMatch(/own trigger group/i);
    expect(res.error).not.toMatch(/percentage/i);
  });

  it("refuses a rule that suggests a product from its own trigger group", async () => {
    const res = await saveDiscountRule(
      {},
      fd({
        name: "Self-suggest",
        enabled: "on",
        triggerMinQty: "2",
        triggerProductIds: JSON.stringify([PROD_A]),
        suggestedProductId: PROD_A,
        suggestedQty: "1",
        discountMode: "none",
        discountPct: "",
      })
    );
    expect(res.error).toMatch(/own trigger group/i);
  });

  it("refuses an empty trigger group", async () => {
    const res = await saveDiscountRule(
      {},
      fd({
        name: "Empty group",
        enabled: "on",
        triggerMinQty: "2",
        triggerProductIds: JSON.stringify([]),
        suggestedProductId: PROD_B,
        suggestedQty: "1",
        discountMode: "none",
        discountPct: "",
      })
    );
    expect(res.error).toBeTruthy();
  });
});

// Duty 4 — ADR 0023 (e): the suggested line inherits the trigger line's
// configCode, which means nothing across suppliers. Since review round 1
// (Important 5), saveDiscountRule derives suppliers itself from the DB rather
// than trusting browser-submitted fields, so this predicate — the actual
// refusal logic — is what's unit-testable without a DB; see the DB-gated
// "cross supplier" test below for proof of the DB wiring around it.
describe("R4-SCONTI suggestedSharesSupplier — validation (no DB call)", () => {
  it("is false when the suggested product shares no supplier with the trigger group", () => {
    expect(suggestedSharesSupplier([SUP_A], SUP_B)).toBe(false);
  });

  it("is true when the suggested product shares a supplier with the trigger group", () => {
    expect(suggestedSharesSupplier([SUP_A], SUP_A)).toBe(true);
  });

  it("is false when the suggested product's supplier could not be resolved", () => {
    expect(suggestedSharesSupplier([SUP_A], undefined)).toBe(false);
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

// ── R4-SCONTI Task 14 — discount_rules / discount_rule_products ─────────────
// Gated on migration 0034 separately from the block above (0032/0033), since
// it can be applied independently. Every row seeded here is a throwaway rule
// this suite creates and deletes; the PRODUCTS it points at are real catalogue
// rows (never created/mutated) — same "read real config, never fabricate
// products" discipline as the block above.
describe.skipIf(!hasRules)(
  "R4-SCONTI discount rules (set MK_E2E_SEED=1; needs migration 0034 applied)",
  () => {
    let db: SupabaseClient;
    let prodA: string;
    let prodB: string;
    let supA: string;
    // A product under a DIFFERENT supplier, if the live catalogue has one —
    // proves the server-side duty-4 wiring (Important 5) actually refuses a
    // real cross-supplier rule, not just the pure predicate in isolation.
    let prodC: string | undefined;
    const seededRuleIds: string[] = [];

    beforeAll(async () => {
      db = createSb(url!, serviceKey!, { auth: { persistSession: false } });
      mockDb.client = db;

      // Real catalogue products (duty 4 requires two that share a supplier)
      // — never created here, this DB also serves the live public site.
      const { data: products, error } = await db
        .from("products")
        .select("id, supplier_id")
        .limit(200);
      if (error) throw error;
      const bySupplier = new Map<string, string[]>();
      for (const p of products ?? []) {
        const arr = bySupplier.get(p.supplier_id) ?? [];
        arr.push(p.id);
        bySupplier.set(p.supplier_id, arr);
      }
      const pair = [...bySupplier.entries()].find(([, ids]) => ids.length >= 2);
      if (!pair) {
        throw new Error(
          "Need a supplier with at least 2 products in the catalogue to run the R4-SCONTI rule tests."
        );
      }
      [prodA, prodB] = pair[1];
      supA = pair[0];
      prodC = [...bySupplier.entries()].find(([sup]) => sup !== supA)?.[1][0];
    });

    afterAll(async () => {
      if (seededRuleIds.length === 0) return;
      // discount_rule_products cascades (migration 0034: on delete cascade).
      const { error } = await db.from("discount_rules").delete().in("id", seededRuleIds);
      if (error) {
        throw new Error(
          `Failed to clean up seeded discount rules on staging — fix by hand (ids: ${seededRuleIds.join(", ")}): ${error.message}`
        );
      }
    });

    it("saves a rule with its trigger group and reads it back", async () => {
      const res = await saveDiscountRule(
        {},
        fd({
          name: `IT rule ${Date.now()}`,
          enabled: "off",
          triggerMinQty: "2",
          triggerProductIds: JSON.stringify([prodA]),
          suggestedProductId: prodB,
          suggestedQty: "1",
          discountMode: "fixed",
          discountPct: "15",
        })
      );
      expect(res.error).toBeUndefined();
      expect(res.id).toBeTruthy();
      seededRuleIds.push(res.id!);

      const { data: rule } = await db
        .from("discount_rules")
        .select("discount_mode, discount_pct")
        .eq("id", res.id!)
        .single();
      expect(rule).toEqual({ discount_mode: "fixed", discount_pct: 15 });

      const { data: links } = await db
        .from("discount_rule_products")
        .select("product_id")
        .eq("rule_id", res.id!);
      expect((links ?? []).map((l) => l.product_id)).toEqual([prodA]);
    });

    // Review round 1, Important 5: proves the DB wiring, not just the pure
    // predicate (which has its own ungated tests above) — a rule pointing at
    // a real product under a different supplier is refused even though
    // nothing in the FormData claims a supplier at all any more.
    it.skipIf(!prodC)("refuses a suggested product from a different real supplier", async () => {
      const res = await saveDiscountRule(
        {},
        fd({
          name: `IT cross-supplier ${Date.now()}`,
          enabled: "off",
          triggerMinQty: "1",
          triggerProductIds: JSON.stringify([prodA]),
          suggestedProductId: prodC!,
          suggestedQty: "1",
          discountMode: "none",
          discountPct: "",
        })
      );
      expect(res.error).toMatch(/supplier/i);
    });

    it("deleting a rule cascades its trigger group away", async () => {
      const saveRes = await saveDiscountRule(
        {},
        fd({
          name: `IT delete ${Date.now()}`,
          enabled: "off",
          triggerMinQty: "1",
          triggerProductIds: JSON.stringify([prodA]),
          suggestedProductId: prodB,
          suggestedQty: "1",
          discountMode: "none",
          discountPct: "",
        })
      );
      expect(saveRes.error).toBeUndefined();
      const id = saveRes.id!;
      // Review round 1, Important 6: push BEFORE asserting the delete — if
      // that assertion fails, afterAll still knows to clean this rule up
      // rather than leaking an enabled... rule onto shared staging.
      seededRuleIds.push(id);

      const delRes = await deleteDiscountRule(fd({ id }));
      expect(delRes.error).toBeUndefined();

      const { data: rule } = await db
        .from("discount_rules")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      expect(rule).toBeNull();
      const { data: links } = await db
        .from("discount_rule_products")
        .select("product_id")
        .eq("rule_id", id);
      expect(links ?? []).toEqual([]);
    });

    // C2 (full round trip): the regression the TL caught — before the fix,
    // this save would fail with a "percentage" error on a field the admin
    // cannot even type into for an INHERITED rule.
    it("saves an INHERITED rule when the percentage field arrives empty", async () => {
      const res = await saveDiscountRule(
        {},
        fd({
          name: `IT inherited ${Date.now()}`,
          enabled: "off",
          triggerMinQty: "2",
          triggerProductIds: JSON.stringify([prodA]),
          suggestedProductId: prodB,
          suggestedQty: "1",
          discountMode: "inherited",
          discountPct: "",
        })
      );
      expect(res.error).toBeUndefined();
      seededRuleIds.push(res.id!);
      const { data } = await db
        .from("discount_rules")
        .select("discount_mode, discount_pct")
        .eq("id", res.id!)
        .single();
      expect(data).toEqual({ discount_mode: "inherited", discount_pct: null });
    });

    it("switching a rule from fixed to none clears the leftover percentage", async () => {
      const name = `IT switch ${Date.now()}`;
      const first = await saveDiscountRule(
        {},
        fd({
          name,
          enabled: "off",
          triggerMinQty: "1",
          triggerProductIds: JSON.stringify([prodA]),
          suggestedProductId: prodB,
          suggestedQty: "1",
          discountMode: "fixed",
          discountPct: "15",
        })
      );
      expect(first.error).toBeUndefined();
      const id = first.id!;
      seededRuleIds.push(id);

      const second = await saveDiscountRule(
        {},
        fd({
          id,
          name,
          enabled: "off",
          triggerMinQty: "1",
          triggerProductIds: JSON.stringify([prodA]),
          suggestedProductId: prodB,
          suggestedQty: "1",
          discountMode: "none",
          discountPct: "",
        })
      );
      expect(second.error).toBeUndefined();

      const { data } = await db
        .from("discount_rules")
        .select("discount_mode, discount_pct")
        .eq("id", id)
        .single();
      expect(data).toEqual({ discount_mode: "none", discount_pct: null });
    });

    // Important 4 — a new rule must not land on the default sort_order=0 tie:
    // with 2+ rules already seeded above, the next insert must sort strictly
    // after every existing one.
    it("gives a new rule a sort_order after every existing rule", async () => {
      const { data: before } = await db
        .from("discount_rules")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const res = await saveDiscountRule(
        {},
        fd({
          name: `IT sort ${Date.now()}`,
          enabled: "off",
          triggerMinQty: "1",
          triggerProductIds: JSON.stringify([prodA]),
          suggestedProductId: prodB,
          suggestedQty: "1",
          discountMode: "none",
          discountPct: "",
        })
      );
      expect(res.error).toBeUndefined();
      seededRuleIds.push(res.id!);

      const { data: after } = await db
        .from("discount_rules")
        .select("sort_order")
        .eq("id", res.id!)
        .single();
      expect(after!.sort_order).toBeGreaterThan(before?.sort_order ?? -1);
    });
  }
);
