import Link from "next/link";
import { AdminShell } from "@/components/shell/admin-shell";
import { OrderStatusBadge } from "@/components/ui-domain/order-status-badge";
import { listOrders } from "@/lib/orders/admin-orders.server";
import {
  computeKpis,
  filterOrders,
  orderSuppliers,
  orderTotal,
  summarizeItems,
  type AdminOrder,
} from "@/lib/orders/admin-orders";
import {
  ORDER_STATUSES,
  STATUS_LABEL,
  type OrderStatus,
} from "@/lib/orders/order-status";
import { formatMoney } from "@/lib/money/money";

// Live operational data: render per request so a status change is reflected.
export const dynamic = "force-dynamic";

const first = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) ?? "";

/** Concise English "received" label for the list. */
function received(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const dayMs = 86_400_000;
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((startToday - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / dayMs);
  const hm = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days <= 0) return `today, ${hm}`;
  if (days === 1) return `yesterday, ${hm}`;
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return d.toLocaleDateString("en-GB");
}

function supplierOptions(orders: AdminOrder[]): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const o of orders) for (const i of o.items) map.set(i.supplierId, i.supplierName);
  return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = first(sp.q);
  const status = first(sp.status);
  const supplier = first(sp.supplier);

  const all = await listOrders();
  const kpis = computeKpis(all);
  const suppliers = supplierOptions(all);
  const rows = filterOrders(all, { status, supplierId: supplier, q });

  const kpiItems = [
    { key: "new", label: "New requests", value: String(kpis.newCount), accent: true },
    { key: "contact", label: "To contact", value: String(kpis.toContactCount) },
    { key: "production", label: "In production", value: String(kpis.inProductionCount) },
    { key: "open", label: "Open orders value", value: formatMoney(kpis.openValue, "en") },
  ];

  return (
    <AdminShell active="/admin" title="Orders">
      <div data-testid="admin-orders">
        {/* KPIs */}
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpiItems.map((k) => (
            <div
              key={k.key}
              data-testid={`kpi-${k.key}`}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div
                className="text-2xl font-semibold tabular-nums"
                style={k.accent ? { color: "var(--primary)" } : undefined}
              >
                {k.value}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{k.label}</div>
            </div>
          ))}
        </div>

        {/* filters (GET form → URL params → server re-render; no JS needed) */}
        <form
          method="get"
          data-testid="orders-filters"
          className="mb-4 flex flex-wrap items-center gap-2.5"
        >
          <input
            name="q"
            defaultValue={q}
            data-testid="filter-q"
            placeholder="Search name, email, order or config code…"
            className="h-9 w-full max-w-[280px] rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          />
          <select
            name="status"
            defaultValue={status}
            data-testid="filter-status"
            className="h-9 rounded-sm border border-input bg-card px-2 text-sm"
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            name="supplier"
            defaultValue={supplier}
            data-testid="filter-supplier"
            className="h-9 rounded-sm border border-input bg-card px-2 text-sm"
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            data-testid="filter-submit"
            className="h-9 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Filter
          </button>
          {(q || status || supplier) && (
            <Link
              href="/admin"
              data-testid="filter-clear"
              className="text-sm text-muted-foreground underline underline-offset-2"
            >
              Clear
            </Link>
          )}
        </form>

        {rows.length === 0 ? (
          <div
            data-testid="orders-empty"
            className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground"
          >
            {all.length === 0 ? "No orders yet." : "No orders match these filters."}
          </div>
        ) : (
          <>
            {/* desktop table (§3.5) */}
            <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Code</th>
                    <th className="px-4 py-2.5 font-medium">Customer</th>
                    <th className="px-4 py-2.5 font-medium">Items</th>
                    <th className="px-4 py-2.5 font-medium">Suppliers</th>
                    <th className="px-4 py-2.5 font-medium">Total</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Received</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    /* F07b: entire row is clickable via a stretched-link
                       pseudo-element. The "Open" Link carries after:absolute
                       after:inset-0 after:content-[''] so its ::after covers the
                       whole <tr position:relative>. No nested <a> — the only
                       link in the row is "Open". Cmd/ctrl-click opens in new tab
                       (native <a> behaviour). */
                    <tr
                      key={o.id}
                      data-testid="order-row"
                      data-code={o.code}
                      className="relative cursor-pointer border-b border-border/50 last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-medium">{o.code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{o.customerName}</div>
                        <div className="text-xs text-muted-foreground">{o.email}</div>
                      </td>
                      <td className="max-w-[260px] px-4 py-3 text-muted-foreground">
                        {summarizeItems(o.items)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {orderSuppliers(o.items).join(", ")}
                      </td>
                      <td className="px-4 py-3 font-medium tabular-nums">
                        {formatMoney(orderTotal(o.items), "en")}
                      </td>
                      <td className="px-4 py-3">
                        <OrderStatusBadge status={o.status as OrderStatus} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {received(o.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          data-testid="order-open"
                          className="text-sm font-medium text-primary underline-offset-2 hover:underline after:absolute after:inset-0 after:content-[''] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* mobile: stacked cards (§3.5) */}
            <div className="flex flex-col gap-3 md:hidden">
              {rows.map((o) => (
                <Link
                  key={o.id}
                  href={`/admin/orders/${o.id}`}
                  data-testid="order-card"
                  data-code={o.code}
                  className="block rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-medium">{o.code}</span>
                    <OrderStatusBadge status={o.status as OrderStatus} />
                  </div>
                  <div className="mt-1.5 font-medium">{o.customerName}</div>
                  <div className="text-xs text-muted-foreground">{o.email}</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {summarizeItems(o.items)}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{received(o.createdAt)}</span>
                    <span className="font-medium tabular-nums">
                      {formatMoney(orderTotal(o.items), "en")}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
