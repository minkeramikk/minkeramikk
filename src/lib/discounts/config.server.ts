import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { EMPTY_CONFIG, type DiscountConfig } from "./discount";

/**
 * The discount config, read ONCE per public render with the anon client (RLS
 * gives anon select on these tables — nothing here is secret, it is all shown
 * in the cart anyway). Cached under the EXISTING `catalog` tag rather than a tag
 * of its own: the admin discount actions are rare and already have to revalidate
 * the catalog, and one tag is one less thing to keep in sync.
 *
 * NEVER throws: a broken read degrades to EMPTY_CONFIG (everything off, full
 * prices) instead of taking the shop's cart down.
 */
export const getDiscountConfig = unstable_cache(loadDiscountConfig, ["discount-config"], {
  tags: ["catalog"],
});

async function loadDiscountConfig(): Promise<DiscountConfig> {
  try {
    const supabase = createPublicClient();
    const [settings, tiers, products] = await Promise.all([
      supabase
        .from("settings")
        .select("quantity_discounts_enabled, automations_enabled")
        .eq("id", 1)
        .maybeSingle(),
      supabase.from("discount_tiers").select("min_qty, pct").order("min_qty"),
      supabase.from("discount_products").select("product_id"),
      // part ②: discount_rules / discount_rule_products reads go here once
      // 0033 lands and the two tables are typed (Task 13).
    ]);

    return {
      tiersEnabled: settings.data?.quantity_discounts_enabled ?? false,
      tiers: (tiers.data ?? []).map((t) => ({ minQty: t.min_qty, pct: t.pct })),
      includedProductIds: (products.data ?? []).map((p) => p.product_id),
      automationsEnabled: settings.data?.automations_enabled ?? false,
      rules: [],
    };
  } catch {
    return EMPTY_CONFIG;
  }
}
