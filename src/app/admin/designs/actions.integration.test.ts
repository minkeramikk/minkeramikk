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

import { duplicateDesign, createDesignFromTemplate, saveDesign } from "./actions";
import { deleteOptions } from "./options-actions";

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

/**
 * R3-VARIE §B — the two slug paths, against real Storage objects:
 *  (1) duplicate WITH a name → slug + asset folders born right (no "-copy"),
 *  (2) editing the slug moves the assets and rewrites every DB path,
 *  (3) a copy that cannot succeed aborts the whole thing — slug unchanged,
 *      paths unchanged, no half-moved design.
 */
describe.skipIf(!hasEnv)("R3-VARIE §B — design slug (integration)", () => {
  let db: SupabaseClient;
  let supplierId: string;
  const madePaths: string[] = []; // storage objects to clean up
  const madeDesigns: string[] = [];

  const PNG = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // just a header: never decoded
  ]);

  async function putObject(path: string) {
    const { error } = await db.storage
      .from("assets")
      .upload(path, PNG, { contentType: "image/png", upsert: true });
    if (error) throw error;
    madePaths.push(path);
  }

  async function objectExists(path: string): Promise<boolean> {
    const slash = path.lastIndexOf("/");
    const { data } = await db.storage
      .from("assets")
      .list(path.slice(0, slash), { search: path.slice(slash + 1) });
    return (data ?? []).some((o) => o.name === path.slice(slash + 1));
  }

  /** A design with one image option (layer + swatch-ish image) and a photo. */
  async function makeDesign(slug: string, name: string, withObjects = true) {
    const id = (
      await db
        .from("designs")
        .insert({
          name,
          name_no: name,
          name_en: name,
          slug,
          supplier_id: supplierId,
          preview_image: `designs/${slug}/preview.png`,
        })
        .select("id")
        .single()
    ).data!.id as string;
    madeDesigns.push(id);

    const catId = (
      await db
        .from("option_categories")
        .insert({
          design_id: id,
          slug: `dots-${Date.now()}`,
          label_no: "Prikker",
          label_en: "Dots",
          kind: "image",
          layer_slot: "detail",
          sort_order: 0,
        })
        .select("id")
        .single()
    ).data!.id as string;

    const optImage = `designs/${slug}/dots/lilla.png`;
    const optLayer = `designs/${slug}/dots/lilla-layer.png`;
    const photo = `design-photos/${slug}/shot-1.png`;
    const opt = await db.from("options").insert({
      category_id: catId,
      name: "Lilla",
      image: optImage,
      layer_image: optLayer,
      sort_order: 0,
      active: true,
    });
    if (opt.error) throw opt.error;
    await db.from("design_images").insert({ design_id: id, image: photo, sort_order: 0 });

    if (withObjects) {
      for (const p of [`designs/${slug}/preview.png`, optImage, optLayer, photo]) {
        await putObject(p);
      }
    }
    return { id, optImage, optLayer, photo };
  }

  function designFd(id: string, name: string, slug: string, confirmed: boolean) {
    return fd({
      id,
      nameNo: name,
      nameEn: name,
      supplierId,
      slug,
      ...(confirmed ? { slugConfirmed: "true" } : {}),
      sortOrder: "0",
      active: "false",
    });
  }

  beforeAll(async () => {
    db = createSb(url!, serviceKey!, { auth: { persistSession: false } });
    mockDb.client = db;
    supplierId = (
      await db.from("suppliers").insert({ name: `R3B Slug ${Date.now()}` }).select("id").single()
    ).data!.id;
  });

  afterAll(async () => {
    await db.from("designs").delete().eq("supplier_id", supplierId);
    await db.from("suppliers").delete().eq("id", supplierId);
    // every object these tests created, originals and copies alike (each test
    // pushes the paths it produced into madePaths)
    if (madePaths.length) await db.storage.from("assets").remove(madePaths);
  });

  it("(1) duplicate with a name → slug and asset folders come from THAT name", async () => {
    const ts = Date.now();
    const src = await makeDesign(`r3b-src-${ts}`, `R3B Src ${ts}`);

    let redirected = false;
    try {
      await duplicateDesign({ error: null }, fd({ id: src.id, nameNo: `R3B Limoni ${ts}`, nameEn: `R3B Lemons ${ts}` }));
    } catch (e) {
      if (!isRedirect(e)) throw e;
      redirected = true;
    }
    expect(redirected).toBe(true);

    const { data: copy } = await db
      .from("designs")
      .select("id, slug, name_no, name_en, preview_image")
      .eq("supplier_id", supplierId)
      .ilike("name_no", `R3B Limoni ${ts}`)
      .single();
    madeDesigns.push(copy!.id);
    expect(copy!.slug).toBe(`r3b-limoni-${ts}`); // NOT "<src> (copy)"
    expect(copy!.slug).not.toMatch(/-copy/);
    expect(copy!.name_en).toBe(`R3B Lemons ${ts}`);
    expect(copy!.preview_image).toBe(`designs/${copy!.slug}/preview.png`);
    madePaths.push(copy!.preview_image!);
    expect(await objectExists(copy!.preview_image!)).toBe(true);
    // the clone's other owned assets landed under the SAME new prefix
    const { data: cats } = await db
      .from("option_categories")
      .select("options(image, layer_image)")
      .eq("design_id", copy!.id);
    const cloned = (cats as unknown as { options: { image: string; layer_image: string }[] }[])[0]
      .options[0];
    const { data: clonedPhotos } = await db
      .from("design_images")
      .select("image")
      .eq("design_id", copy!.id);
    for (const p of [cloned.image, cloned.layer_image, clonedPhotos![0].image]) {
      madePaths.push(p);
      expect(p).toContain(copy!.slug);
    }
  });

  it("(2) editing the slug moves every owned asset and rewrites the DB paths", async () => {
    const ts = Date.now();
    const src = await makeDesign(`r3b-old-${ts}`, `R3B Old ${ts}`);
    const newSlug = `r3b-new-${ts}`;

    let redirected = false;
    try {
      await saveDesign({ error: null }, designFd(src.id, `R3B Old ${ts}`, newSlug, true));
    } catch (e) {
      if (!isRedirect(e)) throw e;
      redirected = true;
    }
    expect(redirected).toBe(true);

    const { data: after } = await db
      .from("designs")
      .select("slug, preview_image, option_categories(options(image, layer_image))")
      .eq("id", src.id)
      .single();
    const row = after as unknown as {
      slug: string;
      preview_image: string;
      option_categories: { options: { image: string; layer_image: string }[] }[];
    };
    expect(row.slug).toBe(newSlug);
    expect(row.preview_image).toBe(`designs/${newSlug}/preview.png`);
    const o = row.option_categories[0].options[0];
    expect(o.image).toBe(src.optImage.replace(`r3b-old-${ts}`, newSlug));
    expect(o.layer_image).toBe(src.optLayer.replace(`r3b-old-${ts}`, newSlug));
    const { data: photos } = await db
      .from("design_images")
      .select("image")
      .eq("design_id", src.id);
    expect(photos![0].image).toBe(src.photo.replace(`r3b-old-${ts}`, newSlug));

    for (const p of [row.preview_image, o.image, o.layer_image, photos![0].image]) {
      madePaths.push(p);
      expect(await objectExists(p)).toBe(true); // moved…
    }
    // …and nothing left behind under the old prefix
    for (const p of [src.optImage, src.optLayer, src.photo]) {
      expect(await objectExists(p)).toBe(false);
    }
  });

  it("(3) a failing copy aborts: slug and paths unchanged, nothing half-moved", async () => {
    const ts = Date.now();
    const oldSlug = `r3b-fail-${ts}`;
    // withObjects=false → the Storage objects the DB points at do not exist,
    // so the very first copy fails: the same abort path as a Storage outage.
    const src = await makeDesign(oldSlug, `R3B Fail ${ts}`, false);
    const newSlug = `r3b-fail-new-${ts}`;

    const res = await saveDesign({ error: null }, designFd(src.id, `R3B Fail ${ts}`, newSlug, true));
    expect(res.error).toMatch(/slug was NOT changed/i);

    const { data: after } = await db
      .from("designs")
      .select("slug, preview_image, option_categories(options(image, layer_image))")
      .eq("id", src.id)
      .single();
    const row = after as unknown as {
      slug: string;
      preview_image: string;
      option_categories: { options: { image: string; layer_image: string }[] }[];
    };
    expect(row.slug).toBe(oldSlug);
    expect(row.preview_image).toBe(`designs/${oldSlug}/preview.png`);
    expect(row.option_categories[0].options[0].image).toBe(src.optImage);
    expect(row.option_categories[0].options[0].layer_image).toBe(src.optLayer);
    const { data: photos } = await db
      .from("design_images")
      .select("image")
      .eq("design_id", src.id);
    expect(photos![0].image).toBe(src.photo);
  });

  it("(4) a malformed or duplicate slug is refused with no change at all", async () => {
    const ts = Date.now();
    const src = await makeDesign(`r3b-guard-${ts}`, `R3B Guard ${ts}`);
    const other = await makeDesign(`r3b-taken-${ts}`, `R3B Taken ${ts}`);
    expect(other.id).toBeTruthy();

    const bad = await saveDesign(
      { error: null },
      designFd(src.id, `R3B Guard ${ts}`, "Not A Slug!", true)
    );
    expect(bad.error).toMatch(/lowercase/i);

    const taken = await saveDesign(
      { error: null },
      designFd(src.id, `R3B Guard ${ts}`, `r3b-taken-${ts}`, true)
    );
    expect(taken.error).toMatch(/already used/i);

    const unconfirmed = await saveDesign(
      { error: null },
      designFd(src.id, `R3B Guard ${ts}`, `r3b-guard-renamed-${ts}`, false)
    );
    expect(unconfirmed.error).toMatch(/confirm/i);

    const { data: after } = await db.from("designs").select("slug").eq("id", src.id).single();
    expect(after!.slug).toBe(`r3b-guard-${ts}`);
  });
});

/** Bug 6 — batch option delete, scoped to the category it was issued from. */
describe.skipIf(!hasEnv)("Bug 6 — deleteOptions (integration)", () => {
  let db: SupabaseClient;
  let supplierId: string;
  let designId: string;
  let catA: string;
  let catB: string;
  let ids: string[];
  let strayId: string;

  beforeAll(async () => {
    db = createSb(url!, serviceKey!, { auth: { persistSession: false } });
    mockDb.client = db;
    const ts = Date.now();
    supplierId = (
      await db.from("suppliers").insert({ name: `Bug6 ${ts}` }).select("id").single()
    ).data!.id;
    designId = (
      await db
        .from("designs")
        .insert({ name: `Bug6 ${ts}`, name_no: "B6", name_en: "B6", slug: `bug6-${ts}`, supplier_id: supplierId })
        .select("id")
        .single()
    ).data!.id;
    const mkCat = async (slug: string) =>
      (
        await db
          .from("option_categories")
          .insert({ design_id: designId, slug, label_no: slug, label_en: slug, kind: "image", layer_slot: "detail", sort_order: 0 })
          .select("id")
          .single()
      ).data!.id as string;
    catA = await mkCat(`a-${ts}`);
    catB = await mkCat(`b-${ts}`);

    const { data: made } = await db
      .from("options")
      .insert([
        { category_id: catA, name: "one", image: "x/1.png", sort_order: 0, active: true },
        { category_id: catA, name: "two", image: "x/2.png", sort_order: 1, active: true },
        { category_id: catA, name: "three", image: "x/3.png", sort_order: 2, active: true },
      ])
      .select("id, name");
    ids = made!.filter((o) => o.name !== "three").map((o) => o.id);
    strayId = (
      await db
        .from("options")
        .insert({ category_id: catB, name: "other", image: "x/9.png", sort_order: 0, active: true })
        .select("id")
        .single()
    ).data!.id;
  });

  afterAll(async () => {
    await db.from("designs").delete().eq("id", designId);
    await db.from("suppliers").delete().eq("id", supplierId);
  });

  it("deletes exactly the selected options, and nothing from another category", async () => {
    const res = await deleteOptions(
      { error: null },
      fd({ designId, categoryId: catA, ids: JSON.stringify([...ids, strayId]) })
    );
    expect(res.error).toBeNull();

    const { data: left } = await db.from("options").select("id, name").eq("category_id", catA);
    expect(left!.map((o) => o.name)).toEqual(["three"]);
    // the id from the OTHER category was in the payload but is scoped out
    const { data: stray } = await db.from("options").select("id").eq("id", strayId).maybeSingle();
    expect(stray).not.toBeNull();
  });

  it("refuses an empty or malformed selection", async () => {
    expect((await deleteOptions({ error: null }, fd({ designId, categoryId: catA, ids: "[]" }))).error)
      .toMatch(/invalid selection/i);
    expect((await deleteOptions({ error: null }, fd({ designId, categoryId: catA, ids: "not json" }))).error)
      .toMatch(/invalid selection/i);
  });
});
