import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { assetUrl } from "@/lib/storage";
import type { Currency } from "@/lib/money/money";
import { EMPTY_CONFIG, type DiscountConfig } from "./discount";

/**
 * The discount config, read ONCE per public render with the anon client (RLS
 * gives anon select on these tables — nothing here is secret, it is all shown
 * in the cart anyway). Cached under the EXISTING `catalog` tag rather than a tag
 * of its own: the admin discount actions are rare and already have to revalidate
 * the catalog, and one tag is one less thing to keep in sync.
 *
 * `revalidate: 10` — tag-only invalidation means an out-of-band change (a
 * direct SQL update to `settings.quantity_discounts_enabled` or the tier
 * rows, the most likely way this shop first turns the feature on) would
 * otherwise never be noticed by a running server: nothing would ever call
 * `revalidateTag("catalog")`, and the live site would keep serving full
 * prices indefinitely with no error to explain why. The shop must notice
 * such a change within a bounded window; ten seconds of staleness on a
 * config this rarely read costs at most one small anon query per ten
 * seconds. The admin path is unaffected — `revalidateTag` there still
 * invalidates instantly.
 */
const cached = unstable_cache(loadDiscountConfig, ["discount-config"], {
  tags: ["catalog"],
  revalidate: 10,
});

/** Never throws — see the note on loadDiscountConfig. The guard is OUTSIDE the
 *  cache wrapper on purpose: unstable_cache itself can throw (e.g. called
 *  outside a request scope), and the inner try/catch cannot see that. A broken
 *  read degrades to EMPTY_CONFIG (everything off, full prices) instead of
 *  taking checkout or the cart down. */
export const getDiscountConfig = async (): Promise<DiscountConfig> => {
  try {
    return await cached();
  } catch {
    return EMPTY_CONFIG;
  }
};

async function loadDiscountConfig(): Promise<DiscountConfig> {
  try {
    const supabase = createPublicClient();
    const [settings, tiers, products, rules, ruleProducts] = await Promise.all([
      supabase
        .from("settings")
        .select("quantity_discounts_enabled, automations_enabled")
        .eq("id", 1)
        .maybeSingle(),
      supabase.from("discount_tiers").select("min_qty, pct").order("min_qty"),
      supabase.from("discount_products").select("product_id"),
      // part ②: automation rules (ADR 0023). enabled only, admin sort order.
      supabase
        .from("discount_rules")
        .select(
          "id, name, trigger_min_qty, suggested_product_id, suggested_qty, discount_mode, discount_pct"
        )
        .eq("enabled", true)
        .order("sort_order"),
      supabase.from("discount_rule_products").select("rule_id, product_id"),
    ]);

    // The suggested product's public card, resolved server-side so the cart
    // never fetches (Task 13). A rule whose target is missing or hidden is
    // dropped below rather than rendered broken.
    const suggestedIds = [
      ...new Set((rules.data ?? []).map((r) => r.suggested_product_id)),
    ];
    const { data: sugProducts } = suggestedIds.length
      ? await supabase
          .from("products")
          .select("id, slug, name_no, name_en, price_cents, currency, image, pieces, supplier_id")
          .in("id", suggestedIds)
          .eq("visible", true)
      : { data: [] };
    const sugById = new Map((sugProducts ?? []).map((p) => [p.id, p]));

    const triggersByRule = new Map<string, string[]>();
    for (const rp of ruleProducts.data ?? []) {
      const list = triggersByRule.get(rp.rule_id) ?? [];
      list.push(rp.product_id);
      triggersByRule.set(rp.rule_id, list);
    }

    const resolvedRules = (rules.data ?? []).flatMap((r) => {
      const p = sugById.get(r.suggested_product_id);
      if (!p) return []; // suggested product missing/hidden ⇒ the rule never fires
      return [
        {
          id: r.id,
          name: r.name,
          triggerProductIds: triggersByRule.get(r.id) ?? [],
          triggerMinQty: r.trigger_min_qty,
          suggestedProductId: r.suggested_product_id,
          suggestedQty: r.suggested_qty,
          discountMode: r.discount_mode as "fixed" | "inherited" | "none",
          discountPct: r.discount_pct,
          suggested: {
            id: p.id,
            slug: p.slug,
            nameNo: p.name_no,
            nameEn: p.name_en,
            priceCents: p.price_cents,
            currency: p.currency as Currency,
            // `products.image` is a Storage PATH (products/x.png), not a URL.
            // Resolve it HERE so `suggested.image` is a ready-to-render URL, the
            // same contract `plateImage` already has on a cart line — the card must
            // not have to know where assets live.
            image: p.image ? assetUrl(p.image) : null,
            pieces: p.pieces,
            supplierId: p.supplier_id,
          },
        },
      ];
    });

    return {
      tiersEnabled: settings.data?.quantity_discounts_enabled ?? false,
      tiers: (tiers.data ?? []).map((t) => ({ minQty: t.min_qty, pct: t.pct })),
      includedProductIds: (products.data ?? []).map((p) => p.product_id),
      automationsEnabled: settings.data?.automations_enabled ?? false,
      rules: resolvedRules,
    };
  } catch {
    return EMPTY_CONFIG;
  }
}
