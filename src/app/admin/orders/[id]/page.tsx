import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import { LabPdfActions } from "@/components/admin/lab-pdf-actions";
import { OrderStatusBadge } from "@/components/ui-domain/order-status-badge";
import { getOrder, getCodecDesigns } from "@/lib/orders/admin-orders.server";
import {
  configuratorPathFromCode,
  orderTotal,
  type AdminOrderItem,
} from "@/lib/orders/admin-orders";
import {
  STATUS_LABEL,
  STATUS_PIPELINE,
} from "@/lib/orders/order-status";
import type { OrderStatus } from "@/lib/orders/order-status";
import { formatMoney } from "@/lib/money/money";
import { OrderStatusForm } from "@/components/admin/order-status-form";
import { updateOrderNotes } from "../actions";

export const dynamic = "force-dynamic";

function groupBySupplier(items: AdminOrderItem[]) {
  const groups: { supplierId: string; supplierName: string; items: AdminOrderItem[] }[] = [];
  for (const it of items) {
    let g = groups.find((x) => x.supplierId === it.supplierId);
    if (!g) {
      g = { supplierId: it.supplierId, supplierName: it.supplierName, items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }
  return groups;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [order, codecDesigns] = await Promise.all([getOrder(id), getCodecDesigns()]);
  if (!order) notFound();

  const groups = groupBySupplier(order.items);
  const currentIndex = STATUS_PIPELINE.indexOf(order.status);
  const modified = order.updatedAt !== order.createdAt;

  return (
    <AdminShell
      active="/admin"
      title={`Order ${order.code}`}
      action={
        <Link
          href="/admin"
          data-testid="back-to-orders"
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          ‹ All orders
        </Link>
      }
    >
      <div data-testid="order-detail" data-status={order.status}>
        {/* status pipeline */}
        <div className="mb-6 flex flex-wrap items-center gap-1.5 text-xs">
          {STATUS_PIPELINE.map((s, i) => {
            const done = currentIndex >= 0 && i <= currentIndex;
            return (
              <span
                key={s}
                className="rounded-full border px-2.5 py-1"
                style={{
                  borderColor: done ? "var(--primary)" : "var(--border)",
                  backgroundColor: done
                    ? "color-mix(in oklab, var(--primary) 12%, white)"
                    : "transparent",
                  color: done ? "color-mix(in oklab, var(--primary), black 30%)" : "var(--muted-foreground)",
                  fontWeight: i === currentIndex ? 600 : 400,
                }}
              >
                {STATUS_LABEL[s]}
              </span>
            );
          })}
          {order.status === "cancelled" && <OrderStatusBadge status="cancelled" />}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
          {/* LEFT: items + notes */}
          <div className="flex flex-col gap-5">
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-3 text-base font-semibold">Configured items</h2>

              {groups.map((g) => (
                <div key={g.supplierId} className="mb-4 last:mb-0">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      {g.supplierName}
                    </span>
                    <LabPdfActions orderId={order.id} supplierId={g.supplierId} />
                  </div>
                  <div className="overflow-hidden rounded-sm border border-border/60">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Item</th>
                          <th className="px-3 py-2 font-medium">Design</th>
                          <th className="px-3 py-2 font-medium">Qty</th>
                          <th className="px-3 py-2 text-right font-medium">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((it) => {
                          const href = configuratorPathFromCode(
                            it.configCode,
                            codecDesigns,
                            order.locale === "en" ? "en" : "no"
                          );
                          const chip = it.configSnapshot?.selections?.find((s) => s.hex)?.hex;
                          return (
                            <tr key={it.id} data-testid="detail-item" className="border-b border-border/40 last:border-0">
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span
                                    aria-hidden
                                    className="size-7 shrink-0 rounded-sm border border-border bg-muted"
                                    style={chip ? { backgroundColor: chip } : undefined}
                                  />
                                  <span className="font-medium">{it.productName}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="text-xs">
                                  {it.configSnapshot?.designName ?? "—"}
                                </div>
                                {it.configCode &&
                                  (href ? (
                                    <Link
                                      href={href}
                                      data-testid="config-code-link"
                                      className="font-mono text-[11px] text-primary underline-offset-2 hover:underline"
                                    >
                                      {it.configCode}
                                    </Link>
                                  ) : (
                                    <span className="font-mono text-[11px] text-muted-foreground">
                                      {it.configCode}
                                    </span>
                                  ))}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums">{it.quantity}</td>
                              <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                                {formatMoney(
                                  orderTotal([it]),
                                  "en"
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              <div className="mt-3 flex items-center justify-end gap-3 border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">Total</span>
                <span data-testid="detail-total" className="text-lg font-semibold tabular-nums">
                  {formatMoney(orderTotal(order.items), "en")}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                The config code reopens the exact design in the configurator — handy on the
                phone with the customer.
              </p>
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-3 text-base font-semibold">Internal notes</h2>
              <form action={updateOrderNotes} data-testid="notes-form" className="flex flex-col gap-2">
                <input type="hidden" name="id" value={order.id} />
                <textarea
                  name="notes"
                  data-testid="notes-input"
                  rows={3}
                  defaultValue={order.internalNotes ?? ""}
                  placeholder="e.g. call back Thursday, wants delivery before Christmas…"
                  className="w-full rounded-sm border border-input bg-card p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                />
                <button
                  type="submit"
                  data-testid="notes-save"
                  className="self-start rounded-lg border border-border bg-ink px-3 py-1.5 text-sm font-medium text-ink-foreground"
                >
                  Save note
                </button>
              </form>
            </section>
          </div>

          {/* RIGHT: customer + actions */}
          <div className="flex flex-col gap-5">
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-3 text-base font-semibold">Customer</h2>
              <p className="font-medium">{order.customerName}</p>
              <p className="text-sm">
                <a href={`mailto:${order.email}`} className="text-primary underline-offset-2 hover:underline">
                  {order.email}
                </a>
              </p>
              {order.phone && <p className="text-sm">{order.phone}</p>}
              {order.message && (
                <>
                  <p className="mt-3 text-xs text-muted-foreground">Customer message:</p>
                  <p className="text-sm italic">«{order.message}»</p>
                </>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-3 text-base font-semibold">Actions</h2>
              {/* F07b: controlled select + inline confirmation + error display */}
              <OrderStatusForm
                orderId={order.id}
                currentStatus={order.status as OrderStatus}
              />
              <a
                href={`mailto:${order.email}?subject=${encodeURIComponent(`Order ${order.code}`)}`}
                data-testid="email-customer"
                className="mt-2 block rounded-lg border border-border px-3 py-2 text-center text-sm"
              >
                Email the customer
              </a>
              <p className="mt-3 text-xs text-muted-foreground">
                Received: {fmtDateTime(order.createdAt)}
                <br />
                Last modified: {modified ? fmtDateTime(order.updatedAt) : "—"}
              </p>
            </section>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
