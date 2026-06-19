/**
 * Negative RLS tests (TODO 1.3) — run against the LINKED remote database.
 * They seed real rows with the service role, then verify the anon client
 * cannot see or touch what the policies protect. Falsifiable by design:
 * if RLS were disabled, the assertions on seeded data would fail.
 *
 * Skipped automatically when Supabase env vars are absent (e.g. CI):
 * secrets never land in the repository.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(__dirname, "../../../.env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // no .env.local (CI): tests below are skipped
  }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasEnv = Boolean(url && anonKey && serviceKey);

describe.skipIf(!hasEnv)("RLS — anon client", () => {
  let anon: SupabaseClient;
  let admin: SupabaseClient;
  let supplierId: string;
  let inactiveSupplierId: string;
  let orderId: string;
  let visibleProductId: string;
  let hiddenProductId: string;

  beforeAll(async () => {
    anon = createClient(url!, anonKey!);
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false },
    });

    const supplier = await admin
      .from("suppliers")
      .insert({ name: "RLS Test Supplier", email: "secret@example.com" })
      .select("id")
      .single();
    if (supplier.error) throw supplier.error;
    supplierId = supplier.data.id;

    const inactive = await admin
      .from("suppliers")
      .insert({ name: "RLS Inactive Supplier", active: false })
      .select("id")
      .single();
    if (inactive.error) throw inactive.error;
    inactiveSupplierId = inactive.data.id;

    const order = await admin
      .from("orders")
      .insert({
        code: `RLS-TEST-${Date.now()}`,
        customer_name: "RLS Test",
        email: "rls-test@example.com",
        locale: "no",
      })
      .select("id")
      .single();
    if (order.error) throw order.error;
    orderId = order.data.id;

    // one visible + one hidden product for the test supplier (F03 AC1)
    const ts = Date.now();
    const visible = await admin
      .from("products")
      .insert({
        slug: `rls-visible-${ts}`,
        supplier_id: supplierId,
        name_no: "RLS Visible",
        name_en: "RLS Visible",
        price_cents: 50_000,
        currency: "NOK",
        visible: true,
      })
      .select("id")
      .single();
    if (visible.error) throw visible.error;
    visibleProductId = visible.data.id;

    const hidden = await admin
      .from("products")
      .insert({
        slug: `rls-hidden-${ts}`,
        supplier_id: supplierId,
        name_no: "RLS Hidden",
        name_en: "RLS Hidden",
        price_cents: 60_000,
        currency: "NOK",
        visible: false,
      })
      .select("id")
      .single();
    if (hidden.error) throw hidden.error;
    hiddenProductId = hidden.data.id;
  });

  afterAll(async () => {
    if (orderId) await admin.from("orders").delete().eq("id", orderId);
    if (visibleProductId)
      await admin.from("products").delete().eq("id", visibleProductId);
    if (hiddenProductId)
      await admin.from("products").delete().eq("id", hiddenProductId);
    if (supplierId)
      await admin.from("suppliers").delete().eq("id", supplierId);
    if (inactiveSupplierId)
      await admin.from("suppliers").delete().eq("id", inactiveSupplierId);
  });

  it("cannot read suppliers (seeded row is invisible)", async () => {
    // control: the service role DOES see the seeded supplier
    const control = await admin
      .from("suppliers")
      .select("id")
      .eq("id", supplierId);
    expect(control.data).toHaveLength(1);

    const { data, error } = await anon.from("suppliers").select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("cannot read orders (seeded row is invisible)", async () => {
    const control = await admin.from("orders").select("id").eq("id", orderId);
    expect(control.data).toHaveLength(1);

    const { data, error } = await anon.from("orders").select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("cannot insert into the catalog (designs)", async () => {
    const { error } = await anon.from("designs").insert({
      supplier_id: supplierId,
      slug: `rls-test-${Date.now()}`,
      name: "RLS Test Design",
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501"); // insufficient_privilege
  });

  it("cannot update settings", async () => {
    const { data, error } = await anon
      .from("settings")
      .update({ color_accent: "#000000" })
      .eq("id", 1)
      .select();
    // RLS: either an explicit error or zero affected rows
    if (error) {
      expect(error.code).toBe("42501");
    } else {
      expect(data).toHaveLength(0);
    }
    // control: the row still has its original accent
    const after = await admin
      .from("settings")
      .select("color_accent")
      .eq("id", 1)
      .single();
    expect(after.data!.color_accent).not.toBe("#000000");
  });

  // R2-1a / AC4: only authenticated admins may set the cover default; anon is
  // blocked by RLS. Self-contained: reads a real option id with the service
  // role, then verifies the anon update affects no rows (so it mutates nothing).
  it("cannot set an option's is_default (R2-1a)", async () => {
    const existing = await admin
      .from("options")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (!existing.data) return; // no options in this DB — nothing to assert
    const optionId = existing.data.id;

    const { data, error } = await anon
      .from("options")
      .update({ is_default: true })
      .eq("id", optionId)
      .select("id");

    // RLS blocks the write: either an explicit error or zero rows affected.
    expect(error ? true : (data ?? []).length === 0).toBe(true);
  });

  it("CAN insert an order (public insert is allowed) but cannot read it back", async () => {
    const code = `RLS-ANON-${Date.now()}`;
    const { error } = await anon.from("orders").insert({
      code,
      customer_name: "Anon Customer",
      email: "anon@example.com",
      locale: "en",
    });
    expect(error).toBeNull();

    const { data } = await anon.from("orders").select("id").eq("code", code);
    expect(data).toHaveLength(0);

    await admin.from("orders").delete().eq("code", code);
  });

  // ── F03: anon sees only visible products of the supplier ──

  it("anon sees visible products but NOT hidden ones (F03 AC1)", async () => {
    const { data, error } = await anon
      .from("products")
      .select("id, visible")
      .eq("supplier_id", supplierId);
    expect(error).toBeNull();
    const ids = (data ?? []).map((p) => p.id);
    expect(ids).toContain(visibleProductId);
    expect(ids).not.toContain(hiddenProductId);
    // control: the service role sees both
    const control = await admin
      .from("products")
      .select("id")
      .eq("supplier_id", supplierId);
    expect(control.data!.length).toBe(2);
  });

  it("can read public settings (theme tokens)", async () => {
    const { data, error } = await anon.from("settings").select("*");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  // ── ADR 0009: supplier name public, contacts never ──

  it("reads supplier NAME via public_suppliers (active rows only)", async () => {
    const { data, error } = await anon
      .from("public_suppliers")
      .select("id, name, active");
    expect(error).toBeNull();
    // the imported Vietri supplier is active and therefore visible…
    expect(data!.some((s) => s.name === "Vietri")).toBe(true);
    // …while the inactive seeded supplier is filtered out by the view
    const { data: inactiveRows } = await anon
      .from("public_suppliers")
      .select("id")
      .eq("id", inactiveSupplierId);
    expect(inactiveRows).toHaveLength(0);
  });

  it("cannot read supplier CONTACTS: no email column on the view, no row on the table", async () => {
    // the view does not expose the column at all
    const viaView = await anon.from("public_suppliers").select("email");
    expect(viaView.error).not.toBeNull();

    // the base table stays authenticated-only (control: service role sees the email)
    const control = await admin
      .from("suppliers")
      .select("email")
      .eq("id", supplierId);
    expect(control.data).toHaveLength(1);

    const viaTable = await anon.from("suppliers").select("email");
    expect(viaTable.error).toBeNull();
    expect(viaTable.data).toHaveLength(0);
  });
});

describe.skipIf(!hasEnv)("RLS — featured_configs (F28)", () => {
  let anon: SupabaseClient;
  let admin: SupabaseClient;
  let featuredId: string;

  beforeAll(async () => {
    anon = createClient(url!, anonKey!);
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false },
    });
    const row = await admin
      .from("featured_configs")
      .insert({
        kind: "design",
        payload: `MK-RLSTEST-${Date.now()}`,
        thumb_image: "featured/rls-test.webp",
        sort_order: 999,
      })
      .select("id")
      .single();
    if (row.error) throw row.error;
    featuredId = row.data.id;
  });

  afterAll(async () => {
    await admin.from("featured_configs").delete().eq("id", featuredId);
  });

  it("anon CAN read featured rows (the strip is public)", async () => {
    const { data, error } = await anon
      .from("featured_configs")
      .select("id")
      .eq("id", featuredId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("anon cannot INSERT a featured row", async () => {
    const { error } = await anon.from("featured_configs").insert({
      kind: "design",
      payload: "MK-ANON-WRITE",
      thumb_image: "featured/anon.webp",
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("anon cannot UPDATE or DELETE a featured row", async () => {
    const upd = await anon
      .from("featured_configs")
      .update({ label_no: "hacked" })
      .eq("id", featuredId)
      .select("id");
    // RLS filters the row out of the write path: no error surface needed,
    // but nothing may be touched
    expect(upd.data ?? []).toHaveLength(0);

    const del = await anon
      .from("featured_configs")
      .delete()
      .eq("id", featuredId)
      .select("id");
    expect(del.data ?? []).toHaveLength(0);

    const still = await admin
      .from("featured_configs")
      .select("label_no")
      .eq("id", featuredId)
      .single();
    expect(still.data?.label_no ?? null).toBeNull();
  });
});
