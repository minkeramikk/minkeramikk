import Link from "next/link";
import { AdminShell } from "@/components/shell/admin-shell";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, money, type Currency } from "@/lib/money/money";
import { ProductOrderList, type SupplierGroup } from "@/components/admin/product-order-list";
import { SupplierPicker } from "@/components/admin/supplier-picker";

// Live data: a new/edited/hidden product is reflected immediately (and so is the
// public configurator step 3, which is force-dynamic).
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ supplier?: string }>;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { supplier } = await searchParams;
  const supabase = await createClient();

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .order("name");
  const supplierList = suppliers ?? [];

  // One supplier at a time: an unknown/absent ?supplier falls back to the first
  // one alphabetically, so the page always shows a real list instead of nothing.
  const selected =
    supplierList.find((s) => s.id === supplier) ?? supplierList[0] ?? null;

  const { data: products } = selected
    ? await supabase
        .from("products")
        .select("id, supplier_id, name_no, price_cents, currency, visible, sort_order, pieces")
        .eq("supplier_id", selected.id)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true }) // stable tiebreak inside the group
    : { data: [] };

  const group: SupplierGroup | null = selected
    ? {
        supplierId: selected.id,
        supplierName: selected.name,
        rows: (products ?? []).map((p) => ({
          id: p.id,
          nameNo: p.name_no,
          supplierId: p.supplier_id,
          price: formatMoney(money(p.price_cents, p.currency as Currency), "en"),
          visible: p.visible,
          pieces: p.pieces,
        })),
      }
    : null;

  return (
    <AdminShell
      active="/admin/products"
      title="Products"
      action={
        <div className="flex items-center gap-2">
          <Link
            href="/admin/products/clone"
            data-testid="clone-ceramics-link"
            className="h-9 rounded-lg border border-border px-3 text-sm font-medium leading-9"
          >
            Clone ceramics
          </Link>
          <Link
            href="/admin/products/new"
            data-testid="new-product"
            className="h-9 rounded-lg bg-primary px-3 text-sm font-medium leading-9 text-primary-foreground"
          >
            New product
          </Link>
        </div>
      }
    >
      <div data-testid="admin-products" className="flex flex-col gap-4">
        {supplierList.length > 1 && (
          <SupplierPicker suppliers={supplierList} selectedId={selected?.id ?? ""} />
        )}

        {!group ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No suppliers yet.
          </div>
        ) : group.rows.length === 0 ? (
          <div
            data-testid="products-empty"
            className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground"
          >
            No ceramics for {group.supplierName} yet.
          </div>
        ) : (
          <ProductOrderList key={group.supplierId} group={group} />
        )}
      </div>
    </AdminShell>
  );
}
