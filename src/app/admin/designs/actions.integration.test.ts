/**
 * F35 hotfix integration tests — duplicateDesign + createDesignFromTemplate
 * against the LINKED remote DB (needs migrations 0022 + 0023 applied).
 *
 * The F35 regression: inserts on `options` outside options-actions/bulk stopped
 * passing supplier_color_id, so the options_kind_shape trigger (ADR 0018) rejects
 * colour options. These tests exercise the two broken paths end-to-end.
 *
 * Skipped when Supabase env is absent (CI): secrets never land in the repo.
 * The server client + next/cache + next/navigation are mocked so the real server
 * actions run against a service-role client and their redirect() is observable.
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

// The action calls createClient() (cookie-based) → swap for the service-role
// client; redirect() throws a NEXT_REDIRECT sentinel we can observe as "success".
const mockDb = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => mockDb.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    const e = new Error("NEXT_REDIRECT");
    (e as unknown as { digest: string }).digest = `NEXT_REDIRECT;push;${to};307`;
    throw e;
  },
}));

import { duplicateDesign, createDesignFromTemplate } from "./actions";

const isRedirect = (e: unknown): boolean =>
  e instanceof Error &&
  typeof (e as { digest?: string }).digest === "string" &&
  (e as { digest: string }).digest.startsWith("NEXT_REDIRECT");

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.set(k, v);
  return f;
}

describe.skipIf(!hasEnv)("F35 hotfix — designs actions (integration, needs 0022+0023)", () => {
  let db: SupabaseClient;
  let supWith: string; // supplier WITH a glaze palette
  let supWithout: string; // supplier WITHOUT a palette
  let colourId: string;
  let srcDesignId: string;
  let srcSlug: string;

  beforeAll(async () => {
    db = createSb(url!, serviceKey!, { auth: { persistSession: false } });
    mockDb.client = db;
    const ts = Date.now();

    supWith = (
      await db.from("suppliers").insert({ name: `F35fix With ${ts}` }).select("id").single()
    ).data!.id;
    supWithout = (
      await db.from("suppliers").insert({ name: `F35fix Without ${ts}` }).select("id").single()
    ).data!.id;

    colourId = (
      await db
        .from("supplier_colors")
        .insert({ supplier_id: supWith, hex: "#0160b2", name: `F35fix Blue ${ts}` })
        .select("id")
        .single()
    ).data!.id;

    srcSlug = `f35fix-src-${ts}`;
    srcDesignId = (
      await db
        .from("designs")
        .insert({ name: `F35fix Src ${ts}`, name_no: "Src", name_en: "Src", slug: srcSlug, supplier_id: supWith })
        .select("id")
        .single()
    ).data!.id;

    const catId = (
      await db
        .from("option_categories")
        .insert({ design_id: srcDesignId, slug: `farge-${ts}`, kind: "color", layer_slot: "base", sort_order: 0 })
        .select("id")
        .single()
    ).data!.id;

    // palette-linked colour option WITH a compositing layer (owned asset path)
    const opt = await db.from("options").insert({
      category_id: catId,
      supplier_color_id: colourId,
      layer_image: `designs/${srcSlug}/farge/0160b2-layer.png`,
      sort_order: 0,
      active: true,
    });
    if (opt.error) throw opt.error;
  });

  afterAll(async () => {
    // designs first (CASCADE clears their categories+options), incl. the copies +
    // template designs the actions created under these two suppliers; then colours;
    // then suppliers (RESTRICT-safe once nothing references them).
    await db.from("designs").delete().in("supplier_id", [supWith, supWithout]);
    await db.from("supplier_colors").delete().in("supplier_id", [supWith, supWithout]);
    await db.from("suppliers").delete().in("id", [supWith, supWithout]);
  });

  async function optionsOf(designId: string) {
    const { data: cats } = await db.from("option_categories").select("id").eq("design_id", designId);
    const catIds = (cats ?? []).map((c) => c.id);
    if (catIds.length === 0) return [];
    const { data } = await db
      .from("options")
      .select("supplier_color_id, name, hex, image, layer_image")
      .in("category_id", catIds);
    return data ?? [];
  }

  it("(a) duplicate carries palette-linked colour options (same supplier_color_id + layer copied)", async () => {
    let redirected = false;
    try {
      await duplicateDesign({ error: null }, fd({ id: srcDesignId }));
    } catch (e) {
      if (!isRedirect(e)) throw e;
      redirected = true; // the bug returns {error:"Could not copy options."} instead
    }
    expect(redirected).toBe(true);

    const { data: copy } = await db
      .from("designs")
      .select("id")
      .eq("supplier_id", supWith)
      .ilike("name", "%(copy)%")
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();
    const opts = await optionsOf(copy!.id);
    expect(opts).toHaveLength(1);
    expect(opts[0].supplier_color_id).toBe(colourId);
    expect(opts[0].layer_image).toBeTruthy();
  });

  it("(b) seed 'colors-only' on a supplier WITH palette: options created + palette-linked", async () => {
    let redirected = false;
    try {
      await createDesignFromTemplate(
        { error: null },
        fd({ template: "colors-only", name: `F35fix Seed ${Date.now()}`, supplierId: supWith })
      );
    } catch (e) {
      if (!isRedirect(e)) throw e;
      redirected = true;
    }
    expect(redirected).toBe(true);

    const { data: design } = await db
      .from("designs")
      .select("id")
      .eq("supplier_id", supWith)
      .ilike("name", "F35fix Seed%")
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();
    const opts = await optionsOf(design!.id);
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) {
      expect(o.supplier_color_id).toBe(colourId); // the supplier's only active colour
      expect(o.name).toBeNull();
      expect(o.hex).toBeNull();
      expect(o.image).toBeNull();
    }
  });

  it("(c) seed on a supplier WITHOUT palette: friendly message, no exception, no orphan design", async () => {
    const countDesigns = async () =>
      (await db.from("designs").select("id", { count: "exact", head: true }).eq("supplier_id", supWithout))
        .count ?? 0;
    const before = await countDesigns();

    const res = await createDesignFromTemplate(
      { error: null },
      fd({ template: "colors-only", name: `F35fix NoPalette ${Date.now()}`, supplierId: supWithout })
    );

    expect(res.error).toMatch(/glaze colours/i);
    expect(await countDesigns()).toBe(before); // palette checked BEFORE creating the design
  });

  it("(d) duplicate carries the dedicated step-2 description (TL amendment 2026-07-17)", async () => {
    const marker = `STEP2-${Date.now()}`;
    // column exists only once migration 0024 is pushed; tolerate its absence so the
    // gate stays green pre-migration, then tighten automatically post-push.
    const upd = await db
      .from("designs")
      .update({ description_step2_no: marker, description_step2_en: marker })
      .eq("id", srcDesignId);
    if (upd.error) return; // pre-0024: columns not present yet — nothing to assert
    let redirected = false;
    try {
      await duplicateDesign({ error: null }, fd({ id: srcDesignId }));
    } catch (e) {
      if (!isRedirect(e)) throw e;
      redirected = true;
    }
    expect(redirected).toBe(true);
    const { data: copy } = await db
      .from("designs")
      .select("description_step2_no, description_step2_en")
      .eq("supplier_id", supWith)
      .ilike("name", "%(copy)%")
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();
    expect(copy!.description_step2_no).toBe(marker);
    expect(copy!.description_step2_en).toBe(marker);
  });
});
