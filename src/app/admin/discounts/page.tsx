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
import { saveDiscountProducts } from "@/app/admin/discounts/actions";

// R4-SCONTI Task 7 — live data, same as /admin/featured: the shop owner must
// see the scale they just saved, not a stale ISR snapshot.
export const dynamic = "force-dynamic";

export default async function AdminDiscountsPage() {
  const supabase = await createClient();

  const [{ data: settings }, { data: tierRows }, { data: discountProductRows }, { data: productRows }] =
    await Promise.all([
      supabase.from("settings").select("quantity_discounts_enabled").eq("id", 1).maybeSingle(),
      supabase.from("discount_tiers").select("min_qty, pct").order("sort_order"),
      supabase.from("discount_products").select("product_id"),
      supabase
        .from("products")
        .select("id, name_no, name_en, price_cents, currency, image, visible")
        .order("name_no"),
    ]);

  const initialTiers = (tierRows ?? []).map((t) => ({ minQty: t.min_qty, pct: t.pct }));
  const initialEnabled = settings?.quantity_discounts_enabled ?? false;
  const selectedProductIds = (discountProductRows ?? []).map((r) => r.product_id);
  const products: EditorProduct[] = (productRows ?? []).map((p) => ({
    id: p.id,
    nameNo: p.name_no,
    nameEn: p.name_en,
    price: formatMoney(money(p.price_cents, p.currency as Currency), "en"),
    image: p.image ? assetUrl(p.image, { width: PRODUCT_THUMB_WIDTH }) : null,
    visible: p.visible,
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
      </div>
    </AdminShell>
  );
}
