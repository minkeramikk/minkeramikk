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
  let orderId: string;

  beforeAll(async () => {
    anon = createClient(url!, anonKey!);
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false },
    });

    const supplier = await admin
      .from("suppliers")
      .insert({ name: "RLS Test Supplier" })
      .select("id")
      .single();
    if (supplier.error) throw supplier.error;
    supplierId = supplier.data.id;

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
  });

  afterAll(async () => {
    if (orderId) await admin.from("orders").delete().eq("id", orderId);
    if (supplierId)
      await admin.from("suppliers").delete().eq("id", supplierId);
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

  it("can read public settings (theme tokens)", async () => {
    const { data, error } = await anon.from("settings").select("*");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});
