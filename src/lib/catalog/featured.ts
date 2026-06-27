import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { getActiveDesigns } from "./designs";
import { getDesignDetail } from "./design-options";
import { getSupplierProducts } from "./products";
import {
  decodeConfigCode,
  toCodecDesign,
  type CodecDesign,
} from "@/lib/configurator/config-code";
import { decodeSetParam } from "@/lib/cart/set-code";

/** A featured_configs row, as stored (F28 / ADR 0016). */
export interface FeaturedRow {
  id: string;
  kind: "design" | "set";
  payload: string;
  labelNo: string | null;
  labelEn: string | null;
  thumbImage: string;
  sortOrder: number;
}

/**
 * A row re-validated against the LIVE catalog (read side is tolerant,
 * ADR 0016): `valid=false` rows are hidden from the home strip but stay in
 * /admin/featured with the reason. Resolved names feed the label fallback.
 */
export interface ValidatedFeatured extends FeaturedRow {
  valid: boolean;
  /** human-readable reason when invalid (admin badge), null when valid */
  reason: string | null;
  /** resolved design name(s) — fallback label & card subtitle */
  designName: string | null;
  /** EN resolved design name (the existing `designName` is the NO one). */
  designNameEn: string | null;
  /** sets only: total pieces (badge "Sett · N deler") */
  setCount: number | null;
}

export type PayloadValidation =
  | {
      ok: true;
      designName: string;
      designNameEn: string;
      setCount: number | null;
      /** the code whose composition represents the entry (set: first row) */
      firstCode: string;
    }
  | { ok: false; reason: string };

/**
 * Validate a featured payload against the LIVE catalog. ONE implementation
 * for both sides of the ADR 0016 asymmetry: the ADD action is strict (an
 * `ok:false` rejects the insert), the read path is tolerant (`ok:false`
 * hides the row from the home and badges it in admin).
 */
export async function validateFeaturedPayload(
  kind: "design" | "set",
  payload: string
): Promise<PayloadValidation> {
  const designs = await getActiveDesigns();
  const details = await Promise.all(designs.map((d) => getDesignDetail(d.slug)));
  const codecs = details
    .map((d) => d && toCodecDesign(d))
    .filter((c): c is CodecDesign => Boolean(c));
  const findByCode = (code: string) =>
    codecs.find((c) => c.code === code.toUpperCase()) ?? null;
  const designBySlug = new Map(designs.map((d) => [d.slug, d]));

  type DesignChoice = NonNullable<ReturnType<typeof designBySlug.get>>;
  const resolveDesign = (
    code: string
  ): { design: DesignChoice; reason?: never } | { design?: never; reason: string } => {
    try {
      const { designSlug } = decodeConfigCode(code, findByCode);
      const design = designBySlug.get(designSlug);
      return design ? { design } : { reason: `design "${designSlug}" is not active` };
    } catch {
      return { reason: `code "${code}" does not resolve to an active design` };
    }
  };

  if (kind === "design") {
    const r = resolveDesign(payload);
    return r.reason !== undefined
      ? { ok: false, reason: r.reason }
      : {
          ok: true,
          designName: r.design.nameNo,
          designNameEn: r.design.nameEn,
          setCount: null,
          firstCode: payload,
        };
  }

  // kind=set: every row must still resolve (design active + ceramic visible)
  const { entries, dropped } = decodeSetParam(payload);
  if (entries.length === 0 || dropped > 0) {
    return { ok: false, reason: "set payload no longer parses" };
  }
  const namesNo: string[] = [];
  const namesEn: string[] = [];
  for (const entry of entries) {
    const r = resolveDesign(entry.configCode);
    if (r.reason !== undefined) return { ok: false, reason: r.reason };
    if (!namesNo.includes(r.design.nameNo)) namesNo.push(r.design.nameNo);
    if (!namesEn.includes(r.design.nameEn)) namesEn.push(r.design.nameEn);
    const products = await getSupplierProducts(r.design.supplierId);
    if (!products.some((p) => p.slug === entry.productSlug)) {
      return { ok: false, reason: `product "${entry.productSlug}" is hidden or gone` };
    }
  }
  return {
    ok: true,
    designName: namesNo.join(" + "),
    designNameEn: namesEn.join(" + "),
    setCount: entries.reduce((n, e) => n + e.qty, 0),
    firstCode: entries[0].configCode,
  };
}

async function loadValidatedFeatured(): Promise<ValidatedFeatured[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("featured_configs")
    .select("id, kind, payload, label_no, label_en, thumb_image, sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw error;

  const rows: FeaturedRow[] = (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind as "design" | "set",
    payload: r.payload,
    labelNo: r.label_no,
    labelEn: r.label_en,
    thumbImage: r.thumb_image,
    sortOrder: r.sort_order,
  }));

  return Promise.all(
    rows.map(async (row): Promise<ValidatedFeatured> => {
      const v = await validateFeaturedPayload(row.kind, row.payload);
      return v.ok
        ? {
            ...row,
            valid: true,
            reason: null,
            designName: v.designName,
            designNameEn: v.designNameEn,
            setCount: v.setCount,
          }
        : { ...row, valid: false, reason: v.reason, designName: null, designNameEn: null, setCount: null };
    })
  );
}

/**
 * Featured rows re-validated against the live catalog. Cached under BOTH
 * tags: admin featured mutations revalidate `featured`, catalog writes
 * already revalidate `catalog` — either change re-runs the validation.
 * HOME-strip read; the admin uses the fresh variant below.
 */
export const getFeaturedConfigs = unstable_cache(
  loadValidatedFeatured,
  ["featured-configs"],
  { tags: ["featured", "catalog"] }
);

/**
 * UNCACHED read for /admin/featured: curation must see the DB truth even
 * when rows changed outside the app's revalidation path (seeds, scripts,
 * another operator) — a stale list made the reorder arrows act on rows
 * that weren't where the admin saw them.
 */
export const getFeaturedConfigsFresh = loadValidatedFeatured;
