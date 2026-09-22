import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { resilientRead } from "@/lib/supabase/resilient-read";
import { getActiveDesigns } from "./designs";
import { getDesignDetail } from "./design-options";
import { getDesignProducts, getSupplierProducts } from "./products";
import {
  decodeConfigCode,
  toCodecDesign,
  type CodecDesign,
} from "@/lib/configurator/config-code";
import { decodeSetParam } from "@/lib/cart/set-code";
import { decodeKitParam } from "@/lib/cart/kit-code";
import { stripFeaturedCode, stripFeaturedSet } from "./featured-strip";
import { featuredPrice, type FeaturedPrice } from "./featured-price";
import { getDiscountConfig } from "@/lib/discounts/config.server";
import type { Currency } from "@/lib/money/money";

/** A featured_configs row, as stored (F28 / ADR 0016). */
export interface FeaturedRow {
  id: string;
  kind: "design" | "set" | "kit";
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
  /** sets and kits only: total pieces (badge "Sett · N deler") */
  setCount: number | null;
  /** sets and kits only: live price of the pieces (R5-KIT); null for design */
  price: FeaturedPrice | null;
}

export type PayloadValidation =
  | {
      ok: true;
      designName: string;
      designNameEn: string;
      setCount: number | null;
      /** the code whose composition represents the entry (set: first row).
       *  Already colours-only — see `canonicalPayload`. */
      firstCode: string;
      /**
       * R5-TEXT-IDENTITY (featured-fix) — `payload` with every row's
       * inscription/colour-wish segment stripped (`stripFeaturedCode` /
       * `stripFeaturedSet`). This is what MUST be previewed and stored: an
       * admin can paste a customer's own "Copy code" (cart drawer) into this
       * curator, and without this, that customer's dedication would go
       * straight onto the public home strip.
       */
      canonicalPayload: string;
    }
  | { ok: false; reason: string };

/**
 * Validate a featured payload against the LIVE catalog. ONE implementation
 * for both sides of the ADR 0016 asymmetry: the ADD action is strict (an
 * `ok:false` rejects the insert), the read path is tolerant (`ok:false`
 * hides the row from the home and badges it in admin).
 */
export async function validateFeaturedPayload(
  kind: "design" | "set" | "kit",
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
    if (r.reason !== undefined) return { ok: false, reason: r.reason };
    const canonicalPayload = stripFeaturedCode(payload, findByCode);
    return {
      ok: true,
      designName: r.design.nameNo,
      designNameEn: r.design.nameEn,
      setCount: null,
      firstCode: canonicalPayload,
      canonicalPayload,
    };
  }

  // kind=kit: one design (by code), every slug inside its whitelist
  if (kind === "kit") {
    const { designCode, entries, dropped } = decodeKitParam(payload);
    if (entries.length === 0 || dropped > 0) {
      return { ok: false, reason: "kit payload no longer parses" };
    }
    const detail = (
      await Promise.all(designs.map((d) => getDesignDetail(d.slug)))
    ).find((d) => d != null && d.code === designCode.toUpperCase());
    if (!detail) {
      return { ok: false, reason: `design code "${designCode}" is not active` };
    }
    const active = designBySlug.get(detail.slug);
    if (!active) return { ok: false, reason: `design "${detail.slug}" is not active` };
    const products = await getDesignProducts(active.id, active.supplierId);
    let pieces = 0;
    for (const entry of entries) {
      const product = products.find((p) => p.slug === entry.productSlug);
      if (!product) {
        return { ok: false, reason: `product "${entry.productSlug}" is hidden or gone` };
      }
      pieces += entry.qty * product.pieces;
    }
    const firstCode = `MK-${designCode.toUpperCase()}`;
    return {
      ok: true,
      designName: active.nameNo,
      designNameEn: active.nameEn,
      setCount: pieces,
      firstCode,
      canonicalPayload: payload,
    };
  }

  // kind=set: every row must still resolve (design active + ceramic visible)
  const { entries, dropped } = decodeSetParam(payload);
  if (entries.length === 0 || dropped > 0) {
    return { ok: false, reason: "set payload no longer parses" };
  }
  const namesNo: string[] = [];
  const namesEn: string[] = [];
  let pieces = 0;
  for (const entry of entries) {
    const r = resolveDesign(entry.configCode);
    if (r.reason !== undefined) return { ok: false, reason: r.reason };
    if (!namesNo.includes(r.design.nameNo)) namesNo.push(r.design.nameNo);
    if (!namesEn.includes(r.design.nameEn)) namesEn.push(r.design.nameEn);
    const products = await getSupplierProducts(r.design.supplierId);
    const product = products.find((p) => p.slug === entry.productSlug);
    if (!product) {
      return { ok: false, reason: `product "${entry.productSlug}" is hidden or gone` };
    }
    // "Sett · N deler" counts PIECES, not rows: a one-row entry whose ceramic
    // is itself a set (F29 `products.pieces > 1`, e.g. "Christmas set") is a
    // set too, and its N comes from the ceramic's own piece count.
    pieces += entry.qty * product.pieces;
  }
  const canonicalPayload = stripFeaturedSet(payload, findByCode);
  return {
    ok: true,
    designName: namesNo.join(" + "),
    designNameEn: namesEn.join(" + "),
    setCount: pieces,
    firstCode: decodeSetParam(canonicalPayload).entries[0]?.configCode ?? entries[0].configCode,
    canonicalPayload,
  };
}

async function loadValidatedFeatured(): Promise<ValidatedFeatured[]> {
  // Only the featured rows are wrapped: the validation pass below goes through
  // `getSupplierProducts` and `resolveDesign`, which carry their own retry.
  const data = await resilientRead("featured-configs", async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("featured_configs")
      .select("id, kind, payload, label_no, label_en, thumb_image, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

  const rows: FeaturedRow[] = data.map((r) => ({
    id: r.id,
    kind: r.kind as "design" | "set" | "kit",
    payload: r.payload,
    labelNo: r.label_no,
    labelEn: r.label_en,
    thumbImage: r.thumb_image,
    sortOrder: r.sort_order,
  }));

  // live prices, once per render: sets and kits of the same pieces share the
  // same rows → the same price by construction (AC5). Designs carry no price.
  const bySlug: Record<string, { id: string; priceCents: number; currency: Currency }> = {};
  const activeDesigns = await getActiveDesigns();
  const supplierIds = [...new Set(activeDesigns.map((d) => d.supplierId))];
  const perSupplier = await Promise.all(supplierIds.map((id) => getSupplierProducts(id)));
  for (const list of perSupplier) {
    for (const p of list) {
      bySlug[p.slug] = {
        id: p.id,
        priceCents: p.price.amountCents,
        currency: p.price.currency,
      };
    }
  }
  const discountConfig = await getDiscountConfig();

  return Promise.all(
    rows.map(async (row): Promise<ValidatedFeatured> => {
      const v = await validateFeaturedPayload(row.kind, row.payload);
      if (!v.ok) {
        return { ...row, valid: false, reason: v.reason, designName: null, designNameEn: null, setCount: null, price: null };
      }
      const price =
        row.kind === "design"
          ? null
          : featuredPrice(
              kitPriceRows(row.kind, row.payload),
              bySlug,
              discountConfig
            );
      return {
        ...row,
        valid: true,
        reason: null,
        designName: v.designName,
        designNameEn: v.designNameEn,
        setCount: v.setCount,
        price,
      };
    })
  );
}

/** slug × qty rows of a set or kit payload — the same shape price eats. */
function kitPriceRows(
  kind: "set" | "kit",
  payload: string
): { productSlug: string; qty: number }[] {
  if (kind === "kit") {
    return decodeKitParam(payload).entries.map((e) => ({
      productSlug: e.productSlug,
      qty: e.qty,
    }));
  }
  return decodeSetParam(payload).entries.map((e) => ({
    productSlug: e.productSlug,
    qty: e.qty,
  }));
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
