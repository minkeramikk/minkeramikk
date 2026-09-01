import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import { LabPdfActions } from "@/components/admin/lab-pdf-actions";
import { OrderStatusBadge } from "@/components/ui-domain/order-status-badge";
import { getOrder, getCodecDesigns } from "@/lib/orders/admin-orders.server";
import { getOrderEvents } from "@/lib/orders/order-events.server";
import { timeline } from "@/lib/orders/order-events";
import {
  buildReplicaSet,
  configuratorPathFromCode,
  orderDiscount,
  orderSubtotal,
  orderTotal,
  type AdminOrderItem,
} from "@/lib/orders/admin-orders";
import { designLabel } from "@/lib/cart/cart";
import {
  STATUS_LABEL,
  STATUS_PIPELINE,
} from "@/lib/orders/order-status";
import type { OrderStatus } from "@/lib/orders/order-status";
import { formatMoney } from "@/lib/money/money";
import { OrderStatusForm } from "@/components/admin/order-status-form";
import { OrderMessageForm } from "@/components/admin/order-message-form";
import { OrderTimeline } from "@/components/admin/order-timeline";
import { PaidBadge } from "@/components/ui-domain/paid-badge";
import { DiscountRatifiedBadge } from "@/components/ui-domain/discount-badge";
import {
  toggleDiscountRatified,
  toggleOrderPaid,
  updateOrderNotes,
  updateOrderTracking,
} from "../actions";

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
  // R4-ORDERS-PLUS: the events ride along in the same parallel fetch — the
  // register must not add a round trip to opening an order.
  const [order, codecDesigns, events] = await Promise.all([
    getOrder(id),
    getCodecDesigns(),
    getOrderEvents(id),
  ]);
  if (!order) notFound();

  const groups = groupBySupplier(order.items);
  const currentIndex = STATUS_PIPELINE.indexOf(order.status);
  const modified = order.updatedAt !== order.createdAt;
  // R2-6 D: rebuild this order as a CA-3 shared set → reopen the basket at
  // step 3 (live prices, 3-way banner if the visitor's cart isn't empty).
  const replica = buildReplicaSet(order);
  const replicaLocale = order.locale === "en" ? "en" : "no";

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
                                  {designLabel(it.configSnapshot, replicaLocale) ?? "—"}
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

              <div className="mt-3 flex flex-col items-end gap-1 border-t border-border pt-3">
                {orderDiscount(order.items).amountCents > 0 && (
                  <>
                    <div className="flex w-full items-center justify-end gap-3 text-sm text-muted-foreground">
                      <span>Subtotal</span>
                      <span data-testid="detail-subtotal" className="tabular-nums">
                        {formatMoney(orderSubtotal(order.items), "en")}
                      </span>
                    </div>
                    <div className="flex w-full items-center justify-end gap-3 text-sm font-medium">
                      <span>Discount</span>
                      <span data-testid="detail-discount" className="tabular-nums">
                        −{formatMoney(orderDiscount(order.items), "en")}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex w-full items-center justify-end gap-3">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span data-testid="detail-total" className="text-lg font-semibold tabular-nums">
                    {formatMoney(orderTotal(order.items), "en")}
                  </span>
                </div>
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

            {/* R4-ORDERS-PLUS §B: the register. «Order created» is synthetic, so
                this section is never empty — not even on an order that predates
                the log. */}
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-3 text-base font-semibold">Activity</h2>
              <OrderTimeline rows={timeline(order.createdAt, events)} />
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
              {(order.address || order.zipcode || order.city || order.country) && (
                <p data-testid="customer-address" className="mt-2 text-sm text-muted-foreground">
                  {order.address}
                  {order.address && <br />}
                  {/* R4-ORDERS-PLUS voce C: postnummer, poststed, land — in the
                      order a label carries them. Orders from before the column
                      have city NULL and simply read as they always did. */}
                  {[order.zipcode, order.city, order.country].filter(Boolean).join(" ")}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Language: {order.locale.toUpperCase()}
              </p>
              {order.message && (
                <>
                  <p className="mt-3 text-xs text-muted-foreground">Customer message:</p>
                  <p className="text-sm italic">«{order.message}»</p>
                </>
              )}
            </section>

            {/* R4-ORDERS: payment register (paid_at) + carrier tracking, both
                plain updates on `orders` through the existing RLS policy. */}
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-3 text-base font-semibold">Payment &amp; shipping</h2>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <PaidBadge paidAt={order.paidAt} />
                  {order.paidAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {fmtDateTime(order.paidAt)}
                    </p>
                  )}
                </div>
                <form action={toggleOrderPaid} data-testid="paid-form">
                  <input type="hidden" name="id" value={order.id} />
                  <input type="hidden" name="paid" value={order.paidAt ? "1" : "0"} />
                  <button
                    type="submit"
                    data-testid="paid-toggle"
                    className="rounded-lg border border-border px-3 py-1.5 text-sm"
                  >
                    {order.paidAt ? "Undo payment" : "Register payment & email customer"}
                  </button>
                </form>
              </div>

              {/* R4-MAIL-JOURNEY §C: registering the payment mails the
                  customer; undoing it mails nothing. The button says so
                  because this toggle — unlike a status change — has no confirm
                  dialog to say it in. */}
              <p className="mt-2 w-full text-xs text-muted-foreground">
                {order.paidAt
                  ? "Undoing sends no email."
                  : "Sends the “payment registered” email to the customer."}
              </p>

              {/* R4-SCONTI: only when the order actually carries a discount — an
                  undiscounted order must not grow a control that means nothing. */}
              {orderDiscount(order.items).amountCents > 0 && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <div>
                    <DiscountRatifiedBadge ratifiedAt={order.discountRatifiedAt} />
                    {order.discountRatifiedAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fmtDateTime(order.discountRatifiedAt)}
                      </p>
                    )}
                  </div>
                  <form action={toggleDiscountRatified} data-testid="ratify-form">
                    <input type="hidden" name="id" value={order.id} />
                    <input
                      type="hidden"
                      name="ratified"
                      value={order.discountRatifiedAt ? "1" : "0"}
                    />
                    <button
                      type="submit"
                      data-testid="ratify-toggle"
                      className="rounded-lg border border-border px-3 py-1.5 text-sm"
                    >
                      {order.discountRatifiedAt ? "Un-ratify" : "Ratify discount"}
                    </button>
                  </form>
                </div>
              )}

              <form
                action={updateOrderTracking}
                data-testid="tracking-form"
                className="mt-4 flex flex-col gap-2"
              >
                <input type="hidden" name="id" value={order.id} />
                <label className="text-sm" htmlFor="tracking-input">
                  Tracking code
                </label>
                <input
                  id="tracking-input"
                  name="trackingCode"
                  data-testid="tracking-input"
                  defaultValue={order.trackingCode ?? ""}
                  placeholder="e.g. NO123456789"
                  className="h-9 rounded-sm border border-input bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                />
                <button
                  type="submit"
                  data-testid="tracking-save"
                  className="self-start rounded-lg border border-border bg-ink px-3 py-1.5 text-sm font-medium text-ink-foreground"
                >
                  Save tracking
                </button>
              </form>
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-3 text-base font-semibold">Actions</h2>
              {/* F07b: controlled select + inline confirmation + error display */}
              <OrderStatusForm
                orderId={order.id}
                orderCode={order.code}
                currentStatus={order.status as OrderStatus}
                customerName={order.customerName}
                customerLocale={order.locale === "en" ? "en" : "no"}
                currentTracking={order.trackingCode}
                paidAt={order.paidAt}
                discountSubtotal={formatMoney(orderSubtotal(order.items), "en")}
                discountAmount={formatMoney(orderDiscount(order.items), "en")}
                discountTotal={formatMoney(orderTotal(order.items), "en")}
                hasDiscount={orderDiscount(order.items).amountCents > 0}
                discountRatifiedAt={order.discountRatifiedAt}
              />
              {/* R4-ORDERS-PLUS voce A: was a `mailto:`, which sent whatever the
                  admin's own mail client felt like sending — unbranded, from a
                  personal address, and invisible to the log. */}
              <OrderMessageForm
                orderId={order.id}
                orderCode={order.code}
                customerEmail={order.email}
              />
              {/* R2-6 D: reopen this order as a basket (set codec is URL-safe →
                  raw param). Disabled when no line carries a config code/slug. */}
              {replica.param ? (
                <a
                  href={`/${replicaLocale}/configurator?step=3&set=${replica.param}`}
                  data-testid="replica-set"
                  className="mt-2 block rounded-lg border border-border px-3 py-2 text-center text-sm"
                >
                  Replica set →
                </a>
              ) : (
                <p data-testid="replica-set-empty" className="mt-2 text-xs text-muted-foreground">
                  No replicable lines in this order.
                </p>
              )}
              {replica.param && replica.skipped > 0 && (
                <p data-testid="replica-set-warning" className="mt-1 text-xs text-muted-foreground">
                  {replica.skipped} line{replica.skipped > 1 ? "s" : ""} without a config
                  code were skipped.
                </p>
              )}
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
