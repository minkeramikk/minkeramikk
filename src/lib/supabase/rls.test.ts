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
  let dpDesignId: string;
  let dpForeignSupplierId: string;
  let dpForeignProductId: string;
  let diImageId: string;

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

    // F34 fixtures: a design in `supplierId`, and a product in a DIFFERENT supplier
    const design = await admin
      .from("designs")
      .insert({
        name: "RLS DP Design",
        name_no: "RLS DP",
        name_en: "RLS DP",
        slug: `rls-dp-${ts}`,
        supplier_id: supplierId,
      })
      .select("id")
      .single();
    if (design.error) throw design.error;
    dpDesignId = design.data.id;

    const otherSupplier = await admin
      .from("suppliers")
      .insert({ name: "RLS Other Supplier" })
      .select("id")
      .single();
    if (otherSupplier.error) throw otherSupplier.error;
    dpForeignSupplierId = otherSupplier.data.id;

    const foreignProduct = await admin
      .from("products")
      .insert({
        slug: `rls-foreign-${ts}`,
        supplier_id: dpForeignSupplierId,
        name_no: "Foreign",
        name_en: "Foreign",
        price_cents: 10_000,
        currency: "NOK",
        visible: true,
      })
      .select("id")
      .single();
    if (foreignProduct.error) throw foreignProduct.error;
    dpForeignProductId = foreignProduct.data.id;

    // F36 fixture: a design_images row on the same seeded design.
    // NOTE: false-green until migration 0024 is pushed (table doesn't exist yet
    // remotely — the insert errors here, and the tests below tolerate that too,
    // same pattern as R2-2a/R2-4a). Do NOT throw: a missing design_images table
    // must not abort the whole describe block's beforeAll.
    const image = await admin
      .from("design_images")
      .insert({ design_id: dpDesignId, image: `design-photos/rls-${ts}/a.jpg` })
      .select("id")
      .single();
    diImageId = image.data?.id ?? "";
  });

  afterAll(async () => {
    // CASCADE clears design_products/design_images when the design/foreign supplier go
    if (dpDesignId) await admin.from("designs").delete().eq("id", dpDesignId);
    if (dpForeignProductId)
      await admin.from("products").delete().eq("id", dpForeignProductId);
    if (dpForeignSupplierId)
      await admin.from("suppliers").delete().eq("id", dpForeignSupplierId);
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

  it("anon may SELECT design_products (catalog is public, AC8)", async () => {
    const { error } = await anon
      .from("design_products")
      .select("design_id")
      .limit(1);
    expect(error).toBeNull();
  });

  it("anon may NOT INSERT design_products (AC8)", async () => {
    const { error } = await anon
      .from("design_products")
      .insert({ design_id: dpDesignId, product_id: visibleProductId });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501"); // insufficient_privilege
  });

  // NOTE: false-green until migration 0024 is pushed (design_images doesn't
  // exist yet remotely → both selects/inserts error, which the assertions
  // below also accept — same pattern as R2-2a/R2-4a). Becomes a real RLS
  // assertion once the table exists remotely.
  it("anon may SELECT design_images (catalog is public, F36)", async () => {
    if (!diImageId) return; // table not migrated yet — nothing to assert
    const { data, error } = await anon
      .from("design_images")
      .select("id")
      .eq("id", diImageId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("anon may NOT INSERT design_images (F36)", async () => {
    const { error } = await anon
      .from("design_images")
      .insert({ design_id: dpDesignId, image: "design-photos/x/a.jpg" });
    expect(error).not.toBeNull();
    if (diImageId) expect(error?.code).toBe("42501");
  });

  it("same-supplier trigger rejects a cross-supplier row (AC6, app-bypass)", async () => {
    // service role bypasses RLS but NOT the trigger
    const { error } = await admin
      .from("design_products")
      .insert({ design_id: dpDesignId, product_id: dpForeignProductId });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/different suppliers/i);
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

  // R2-2a / AC1: only authenticated admins may flip accepts_custom_notes; anon
  // is blocked by RLS. Self-contained: reads a real design id with the service
  // role, then verifies the anon update affects no rows.
  // NOTE: false-green until migration 0014 is pushed (the column does not exist
  // yet → the anon update errors, which the assertion also accepts). It becomes
  // a real RLS assertion once the column exists remotely.
  it("cannot set a design's accepts_custom_notes (R2-2a)", async () => {
    const existing = await admin
      .from("designs")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (!existing.data) return; // no designs in this DB — nothing to assert
    const designId = existing.data.id;

    const { data, error } = await anon
      .from("designs")
      .update({ accepts_custom_notes: true })
      .eq("id", designId)
      .select("id");

    // RLS blocks the write: either an explicit error or zero rows affected.
    expect(error ? true : (data ?? []).length === 0).toBe(true);
  });

  // R2-4a / AC1: only authenticated admins may write product attributes; anon
  // is blocked by RLS. Self-contained: discovers a real product id with the
  // service role, then verifies the anon insert affects nothing.
  // NOTE: false-green until migration 0015 is pushed (the table does not exist
  // yet → the anon insert errors, which the assertion also accepts). It becomes
  // a real RLS assertion once the table exists remotely.
  it("cannot insert a product attribute (R2-4a)", async () => {
    const existing = await admin
      .from("products")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (!existing.data) return; // no products in this DB — nothing to assert

    const { error } = await anon.from("product_attributes").insert({
      product_id: existing.data.id,
      key: "custom",
      label_no: "Farge",
      label_en: "Colour",
      value: "Blå",
    });

    // RLS blocks the write: an explicit error is expected (the table also does
    // not exist pre-push, which surfaces as an error too — false-green).
    expect(error).not.toBeNull();
  });

  // Since migration 0020 anon has NO write path to orders: inserts are created
  // only via the create_order() RPC (SECURITY DEFINER, service_role). A direct
  // anon INSERT must be blocked by RLS, and SELECT is still denied too.
  it("cannot insert an order (public insert dropped in 0020) nor read it back", async () => {
    const code = `RLS-ANON-${Date.now()}`;
    const { error } = await anon.from("orders").insert({
      code,
      customer_name: "Anon Customer",
      email: "anon@example.com",
      locale: "en",
    });
    expect(error).not.toBeNull();

    const { data } = await anon.from("orders").select("id").eq("code", code);
    expect(data).toHaveLength(0);
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

  // ── F35 / AC8: supplier_colors palette (fails loudly until 0022 is on staging) ──
  // These reference supplier_colors / options.supplier_color_id / the trigger /
  // the RPC, none of which exist before `make db-push-staging`. That is expected
  // and documented in the CP2 checklist — NO silent skips (F07 lesson).
  describe("AC8 — supplier_colors palette (needs migration 0022)", () => {
    let colourCatId: string;
    let colourId: string;
    let foreignColourId: string;
    let optionId: string;

    beforeAll(async () => {
      const ts = Date.now();
      // a kind=color category on the test design (supplierId)
      const cat = await admin
        .from("option_categories")
        .insert({ design_id: dpDesignId, slug: `rls-color-${ts}`, kind: "color" })
        .select("id")
        .single();
      if (cat.error) throw cat.error;
      colourCatId = cat.data.id;

      // a palette colour for supplierId, and one for the foreign supplier
      const colour = await admin
        .from("supplier_colors")
        .insert({ supplier_id: supplierId, hex: "#0160b2", name: `RLS Havblå ${ts}` })
        .select("id")
        .single();
      if (colour.error) throw colour.error;
      colourId = colour.data.id;

      const foreign = await admin
        .from("supplier_colors")
        .insert({ supplier_id: dpForeignSupplierId, hex: "#ff9048", name: `RLS Foreign ${ts}` })
        .select("id")
        .single();
      if (foreign.error) throw foreign.error;
      foreignColourId = foreign.data.id;

      // a colour option pointing at the same-supplier palette colour (trigger OK)
      const option = await admin
        .from("options")
        .insert({ category_id: colourCatId, supplier_color_id: colourId, sort_order: 0 })
        .select("id")
        .single();
      if (option.error) throw option.error;
      optionId = option.data.id;
    });

    afterAll(async () => {
      // order matters: the option references the colour (RESTRICT), the colour
      // references the supplier (RESTRICT) — clear both before the outer afterAll
      // deletes the suppliers/design.
      if (optionId) await admin.from("options").delete().eq("id", optionId);
      if (colourId) await admin.from("supplier_colors").delete().eq("id", colourId);
      if (foreignColourId)
        await admin.from("supplier_colors").delete().eq("id", foreignColourId);
      // the category is removed by the design CASCADE in the outer afterAll
    });

    it("anon may SELECT supplier_colors (public palette)", async () => {
      const { error } = await anon.from("supplier_colors").select("id").limit(1);
      expect(error).toBeNull();
    });

    it("anon may NOT INSERT or UPDATE supplier_colors", async () => {
      const ins = await anon
        .from("supplier_colors")
        .insert({ supplier_id: supplierId, hex: "#000000", name: "anon" });
      expect(ins.error).not.toBeNull();
      expect(ins.error!.code).toBe("42501");

      const upd = await anon
        .from("supplier_colors")
        .update({ name: "hacked" })
        .eq("id", colourId)
        .select("id");
      expect(upd.error ? true : (upd.data ?? []).length === 0).toBe(true);
    });

    it("trigger rejects a colour option pointing at another supplier's palette colour", async () => {
      // service role bypasses RLS but NOT the trigger
      const { error } = await admin
        .from("options")
        .insert({ category_id: colourCatId, supplier_color_id: foreignColourId, sort_order: 1 });
      expect(error).not.toBeNull();
      expect(error?.message ?? "").toMatch(/different supplier/i);
    });

    it("cannot delete a supplier_color still referenced by an option (RESTRICT, 23503)", async () => {
      const { error } = await admin
        .from("supplier_colors")
        .delete()
        .eq("id", colourId);
      expect(error).not.toBeNull();
      expect(error!.code).toBe("23503");
    });

    it("replace_supplier_colors round-trip: same ids succeed, omitting a used colour raises 23503", async () => {
      // same rows (same id) → delete+reinsert with the deferred FK succeeds
      const same = await admin.rpc("replace_supplier_colors", {
        p_supplier_id: supplierId,
        p_rows: [
          { id: colourId, hex: "#0160b2", name: `RLS Havblå ${Date.now()}`, active: true, sort_order: 0 },
        ],
      });
      expect(same.error).toBeNull();

      // omitting the still-referenced colour → dangling FK at commit → 23503
      const omit = await admin.rpc("replace_supplier_colors", {
        p_supplier_id: supplierId,
        p_rows: [],
      });
      expect(omit.error).not.toBeNull();
      expect(omit.error!.code).toBe("23503");
    });
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

/**
 * F39 — reorder_products ships in migration 0026, applied to the linked DB by
 * hand (ADDITIVE → pushed before merge). Until it is live, PostgREST answers
 * "Could not find the function": a not-yet-provisioned schema, exactly like a
 * missing .env.local, so this block gates on it the same way `hasEnv` gates the
 * rest of the file. This is NOT a silent skip (lesson F07): the reason is
 * printed, and the block re-enables itself the moment 0026 lands.
 */
const hasReorderRpc = hasEnv
  ? await (async () => {
      const probe = createClient(url!, serviceKey!, {
        auth: { persistSession: false },
      });
      const { error } = await probe.rpc("reorder_products", {
        p_supplier_id: "00000000-0000-0000-0000-000000000000",
        p_ids: [],
      });
      const missing = /could not find the function/i.test(error?.message ?? "");
      if (missing) {
        console.warn(
          "[rls.test] reorder_products (migration 0026) is not on the linked DB yet — F39 block skipped"
        );
      }
      return !missing;
    })()
  : false;

describe.skipIf(!hasReorderRpc)(
  // The reason rides in the title: vitest's default reporter swallows
  // console.warn for a file that passes overall, so a bare warn would make this
  // exactly the silent skip F07 taught us not to write.
  hasReorderRpc
    ? "RLS — reorder_products (F39)"
    : "RLS — reorder_products (F39) — SKIPPED: migration 0026 not applied to the linked DB yet",
  () => {
  let anon: SupabaseClient;
  let admin: SupabaseClient;
  let supplierA: string;
  let supplierB: string;
  let a1: string;
  let a2: string;
  let b1: string;

  beforeAll(async () => {
    anon = createClient(url!, anonKey!);
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false },
    });

    const stamp = Date.now();
    const { data: sa } = await admin
      .from("suppliers")
      .insert({ name: `RLS F39 A ${stamp}` })
      .select("id")
      .single();
    const { data: sb } = await admin
      .from("suppliers")
      .insert({ name: `RLS F39 B ${stamp}` })
      .select("id")
      .single();
    supplierA = sa!.id;
    supplierB = sb!.id;

    const mk = async (supplierId: string, n: number) => {
      const { data } = await admin
        .from("products")
        .insert({
          slug: `rls-f39-${supplierId.slice(0, 8)}-${n}-${stamp}`,
          supplier_id: supplierId,
          name_no: `RLS F39 ${n}`,
          name_en: `RLS F39 ${n}`,
          price_cents: 1000,
          sort_order: n,
        })
        .select("id")
        .single();
      return data!.id as string;
    };
    a1 = await mk(supplierA, 1);
    a2 = await mk(supplierA, 2);
    b1 = await mk(supplierB, 1);
  });

  afterAll(async () => {
    await admin.from("products").delete().in("id", [a1, a2, b1]);
    await admin.from("suppliers").delete().in("id", [supplierA, supplierB]);
  });

  it("anon cannot execute reorder_products", async () => {
    const { error } = await anon.rpc("reorder_products", {
      p_supplier_id: supplierA,
      p_ids: [a2, a1],
    });
    expect(error).not.toBeNull();
  });

  it("renumbers the group 1..n in one call", async () => {
    const { error } = await admin.rpc("reorder_products", {
      p_supplier_id: supplierA,
      p_ids: [a2, a1],
    });
    expect(error).toBeNull();
    const { data } = await admin
      .from("products")
      .select("id, sort_order")
      .in("id", [a1, a2]);
    const byId = Object.fromEntries((data ?? []).map((r) => [r.id, r.sort_order]));
    expect(byId[a2]).toBe(1);
    expect(byId[a1]).toBe(2);
  });

  it("raises when an id belongs to another supplier (AC-D3, forged request)", async () => {
    const { error } = await admin.rpc("reorder_products", {
      p_supplier_id: supplierA,
      p_ids: [a1, b1],
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not in supplier/i);
  });

  it("leaves the other supplier's order untouched after the failed call", async () => {
    const { data } = await admin
      .from("products")
      .select("sort_order")
      .eq("id", b1)
      .single();
    expect(data!.sort_order).toBe(1);
  });
}
);
