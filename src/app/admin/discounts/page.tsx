import { AdminShell } from "@/components/shell/admin-shell";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, money, type Currency } from "@/lib/money/money";
import { assetUrl } from "@/lib/storage";
import { PRODUCT_THUMB_WIDTH } from "@/lib/asset-variants";
import { DiscountTiersEditor } from "@/components/admin/discount-tiers-editor";
import {
  ProductMultiSelect,
  type EditorProduct,
} from "@/components/admin/product-multi-select";
import { DiscountRulesEditor, type EditorRule } from "@/components/admin/discount-rules-editor";
import { saveDiscountProducts } from "@/app/admin/discounts/actions";

// R4-SCONTI Task 7 — live data, same as /admin/featured: the shop owner must
// see the scale they just saved, not a stale ISR snapshot.
export const dynamic = "force-dynamic";

export default async function AdminDiscountsPage() {
  const supabase = await createClient();

  const [
    { data: settings },
    { data: tierRows },
    { data: discountProductRows },
    { data: productRows },
    { data: ruleRows, error: ruleErr },
    { data: ruleProductRows },
  ] = await Promise.all([
    supabase
      .from("settings")
      .select("quantity_discounts_enabled, automations_enabled")
      .eq("id", 1)
      .maybeSingle(),
    supabase.from("discount_tiers").select("min_qty, pct").order("sort_order"),
    supabase.from("discount_products").select("product_id"),
    supabase
      .from("products")
      .select("id, name_no, name_en, price_cents, currency, image, visible")
      .order("name_no"),
    // R4-SCONTI Task 14 — absent until the PM applies migration 0034; `?? []`
    // below keeps this page rendering (empty rules list) either way, and
    // `ruleErr` (Minor 4, review round 1) drives an explicit "not available
    // yet" notice instead of a silent empty panel + confusing save failures.
    supabase
      .from("discount_rules")
      .select(
        "id, name, enabled, trigger_min_qty, suggested_product_id, suggested_qty, discount_mode, discount_pct"
      )
      .order("sort_order"),
    supabase.from("discount_rule_products").select("rule_id, product_id"),
  ]);

  const initialTiers = (tierRows ?? []).map((t) => ({ minQty: t.min_qty, pct: t.pct }));
  const initialEnabled = settings?.quantity_discounts_enabled ?? false;
  const initialAutomationsEnabled = settings?.automations_enabled ?? false;
  const selectedProductIds = (discountProductRows ?? []).map((r) => r.product_id);
  const rulesUnavailable = Boolean(ruleErr);
  const products: EditorProduct[] = (productRows ?? []).map((p) => ({
    id: p.id,
    nameNo: p.name_no,
    nameEn: p.name_en,
    price: formatMoney(money(p.price_cents, p.currency as Currency), "en"),
    priceCents: p.price_cents,
    currency: p.currency as Currency,
    image: p.image ? assetUrl(p.image, { width: PRODUCT_THUMB_WIDTH }) : null,
    visible: p.visible,
  }));

  const triggerByRule = new Map<string, string[]>();
  for (const r of ruleProductRows ?? []) {
    const arr = triggerByRule.get(r.rule_id) ?? [];
    arr.push(r.product_id);
    triggerByRule.set(r.rule_id, arr);
  }
  const initialRules: EditorRule[] = (ruleRows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    triggerMinQty: r.trigger_min_qty,
    triggerProductIds: triggerByRule.get(r.id) ?? [],
    suggestedProductId: r.suggested_product_id,
    suggestedQty: r.suggested_qty,
    discountMode: r.discount_mode as EditorRule["discountMode"],
    discountPct: r.discount_pct,
  }));

  return (
    <AdminShell active="/admin/discounts" title="Discounts & Upsell">
      <div className="flex flex-col gap-6">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 text-base font-semibold">Quantity discounts</h2>
          <DiscountTiersEditor initialTiers={initialTiers} initialEnabled={initialEnabled} />
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-3 text-base font-semibold">Applies to</h2>
          <ProductMultiSelect
            action={saveDiscountProducts}
            products={products}
            initialSelectedIds={selectedProductIds}
            formTestId="discount-products-form"
            testIdPrefix="discount-products"
            labels={{
              intro:
                "Choose which products the quantity scale applies to. Excluded products always stay at full price.",
              allTitle: "All products",
              allDesc: "Default. New products are included automatically.",
              someTitle: "Only selected products",
              someDesc: "Pick one or more. New products stay excluded until you tick them.",
              searchPlaceholder: "Search products…",
              counterSuffix: "products get the quantity scale",
              emptyHint: "Select at least one product — or switch back to “All products”.",
              saveLabel: "Save product list",
              savingLabel: "Saving…",
              footnote:
                "Hidden products (visible = off) still count toward the scale here, even though they don't appear in the configurator.",
            }}
          />
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          {rulesUnavailable ? (
            <p className="text-sm text-muted-foreground">
              Automations aren&apos;t available yet — ask your developer to finish
              deploying this feature.
            </p>
          ) : (
            <DiscountRulesEditor
              initialAutomationsEnabled={initialAutomationsEnabled}
              products={products}
              initialRules={initialRules}
            />
          )}
        </section>
      </div>
    </AdminShell>
  );
}
