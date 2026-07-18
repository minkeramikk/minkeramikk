import Link from "next/link";
import { AdminShell } from "@/components/shell/admin-shell";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, money, type Currency } from "@/lib/money/money";
import { ProductOrderList, type SupplierGroup } from "@/components/admin/product-order-list";

// Live data: a new/edited/hidden product is reflected immediately (and so is the
// public configurator step 3, which is force-dynamic).
export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, supplier_id, name_no, price_cents, currency, visible, sort_order, pieces, suppliers(name)")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true }); // stable tiebreak inside a group

  // Group by supplier, suppliers alphabetical — same order as /admin/suppliers.
  const groups: SupplierGroup[] = [];
  for (const p of products ?? []) {
    const supplierName = (p.suppliers as { name: string } | null)?.name ?? "—";
    let g = groups.find((x) => x.supplierId === p.supplier_id);
    if (!g) {
      g = { supplierId: p.supplier_id, supplierName, rows: [] };
      groups.push(g);
    }
    g.rows.push({
      id: p.id,
      nameNo: p.name_no,
      supplierId: p.supplier_id,
      price: formatMoney(money(p.price_cents, p.currency as Currency), "en"),
      visible: p.visible,
      pieces: p.pieces,
    });
  }
  groups.sort((a, b) => a.supplierName.localeCompare(b.supplierName));

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
      <div data-testid="admin-products" className="flex flex-col gap-6">
        {groups.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No products yet.
          </div>
        ) : (
          groups.map((g) => <ProductOrderList key={g.supplierId} group={g} />)
        )}
      </div>
    </AdminShell>
  );
}
