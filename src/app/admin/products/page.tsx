import Link from "next/link";
import { AdminShell } from "@/components/shell/admin-shell";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, money, type Currency } from "@/lib/money/money";
import { toggleProductVisible } from "./actions";
import { ProductMoveActions } from "@/components/admin/product-move-actions";

// Live data: a new/edited/hidden product is reflected immediately (and so is the
// public configurator step 3, which is force-dynamic).
export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, name_no, price_cents, currency, visible, sort_order, pieces, suppliers(name)")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true }); // stable tiebreak — matches moveProduct

  const rows = products ?? [];

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
      <div data-testid="admin-products">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No products yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Supplier</th>
                  <th className="px-4 py-2.5 font-medium">Price</th>
                  <th className="px-4 py-2.5 font-medium">Visible</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => {
                  const supplierName =
                    (p.suppliers as { name: string } | null)?.name ?? "—";
                  return (
                    <tr
                      key={p.id}
                      data-testid="product-row"
                      className="border-b border-border/50 last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-4 py-3 align-top">
                        <ProductMoveActions
                          id={p.id}
                          isFirst={i === 0}
                          isLast={i === rows.length - 1}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {p.name_no}
                        {p.pieces > 1 && (
                          <span
                            data-testid="product-set-chip"
                            className="ml-2 rounded-full bg-ink px-2 py-0.5 align-middle text-[10px] font-bold uppercase text-ink-foreground"
                          >
                            Set · {p.pieces}
                          </span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                        {supplierName}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatMoney(money(p.price_cents, p.currency as Currency), "en")}
                      </td>
                      <td className="px-4 py-3">
                        <form action={toggleProductVisible}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="visible" value={p.visible ? "false" : "true"} />
                          <button
                            type="submit"
                            data-testid="product-toggle-visible"
                            className="text-sm underline-offset-2 hover:underline"
                          >
                            {p.visible ? "Yes" : "No"}
                          </button>
                        </form>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/products/${p.id}`}
                          data-testid="product-edit"
                          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
