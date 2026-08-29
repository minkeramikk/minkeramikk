"use client";

import { useActionState, useEffect, useState } from "react";
import { updateOrderStatus } from "@/app/admin/orders/actions";
import {
  ORDER_STATUSES,
  STATUS_LABEL,
  type OrderStatus,
} from "@/lib/orders/order-status";
import { canEmail, statusEmailText } from "@/lib/orders/status-email";

/**
 * Status form (F07b + R4-ORDERS). The inline confirmation step from F07b now
 * also carries, for a status that notifies the customer, the EXACT preview of
 * the mail (subject + plain text, in the customer's language) and the tick that
 * sends it. The tick is ON by default: the notification is the norm for a
 * weeks-long handmade order, and skipping it is the deliberate gesture. What
 * the admin approves with "Confirm" is literally the text shown above it.
 *
 * Moving to `shipped` needs a tracking code: if the order has none, the dialog
 * offers the field, and shipping without one takes a second, explicit tick.
 *
 * ponytail: importing the copy module pulls email-html into the admin bundle.
 * Deliberate — it is what guarantees preview and sent mail cannot drift. Split
 * the copy out only if the admin bundle size ever matters.
 */
export function OrderStatusForm({
  orderId,
  orderCode,
  currentStatus,
  customerName,
  customerLocale,
  currentTracking,
  paidAt,
  discountSubtotal,
  discountAmount,
  discountTotal,
  hasDiscount,
}: {
  orderId: string;
  orderCode: string;
  currentStatus: OrderStatus;
  customerName: string;
  customerLocale: "no" | "en";
  currentTracking: string | null;
  paidAt: string | null;
  /** Pre-formatted by the server page (Money VO) — this is a client component
   *  and must not re-derive money formatting itself. */
  discountSubtotal: string;
  discountAmount: string;
  discountTotal: string;
  hasDiscount: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateOrderStatus, {});
  const [selected, setSelected] = useState<OrderStatus>(currentStatus);
  const [confirming, setConfirming] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [tracking, setTracking] = useState(currentTracking ?? "");
  const [ackNoTracking, setAckNoTracking] = useState(false);

  // Sync the controlled value whenever RSC delivers a fresh currentStatus after
  // a successful save (or a failed one that left it unchanged).
  useEffect(() => {
    setSelected(currentStatus);
    setConfirming(false);
    setSendEmail(true);
    setAckNoTracking(false);
  }, [currentStatus]);

  useEffect(() => setTracking(currentTracking ?? ""), [currentTracking]);

  const preview = statusEmailText({
    status: selected,
    code: orderCode,
    customerName,
    locale: customerLocale,
    trackingCode: tracking || null,
    paidAt,
  });
  const needsTracking = selected === "shipped" && !tracking.trim();
  const blocked = needsTracking && !ackNoTracking;

  /**
   * Intercept the first submit to show the confirmation step. On the second
   * submit (from "Confirm" inside the block) confirming is already true → we
   * don't prevent → React's formAction calls the server action.
   */
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!confirming) {
      e.preventDefault();
      setConfirming(true);
    }
  }

  return (
    <>
      <form
        action={formAction}
        onSubmit={handleSubmit}
        data-testid="order-status-form"
        className="flex flex-col gap-2.5"
      >
        <input type="hidden" name="id" value={orderId} />
        <label className="text-sm" htmlFor="status-select">
          Change status
        </label>
        <select
          id="status-select"
          name="status"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value as OrderStatus);
            setConfirming(false); // reset if user changes their mind
            setAckNoTracking(false);
          }}
          data-testid="status-select"
          className="h-9 rounded-sm border border-input bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>

        {confirming ? (
          <div
            data-testid="status-confirm-dialog"
            className="flex flex-col gap-2.5 rounded-sm border border-border bg-muted/30 p-3"
          >
            <p className="text-sm">
              Change status from <strong>{STATUS_LABEL[currentStatus]}</strong> to{" "}
              <strong>{STATUS_LABEL[selected]}</strong>?
            </p>

            {/* ADR 0022 / D3: gated on the identical condition as the ratify-on-confirm
                guard in updateOrderStatus, so what the admin reads and what the
                action does can never diverge. */}
            {selected === "confirmed" && hasDiscount && (
              <p data-testid="ratify-confirm-note" className="text-sm">
                Confirming also ratifies the discount: {discountSubtotal} −{" "}
                {discountAmount} = {discountTotal}.
              </p>
            )}

            {selected === "shipped" && (
              <label className="flex flex-col gap-1 text-sm">
                Tracking code
                <input
                  name="trackingCode"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  data-testid="tracking-input-dialog"
                  placeholder="e.g. NO123456789"
                  className="h-9 rounded-sm border border-input bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                />
              </label>
            )}

            {needsTracking && (
              <label
                data-testid="ack-no-tracking-label"
                className="flex items-start gap-2 text-sm text-destructive"
              >
                <input
                  type="checkbox"
                  name="ackNoTracking"
                  checked={ackNoTracking}
                  onChange={(e) => setAckNoTracking(e.target.checked)}
                  data-testid="ack-no-tracking"
                  className="mt-0.5"
                />
                Ship without a tracking code.
              </label>
            )}

            {canEmail(selected) && preview && (
              <>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="sendEmail"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                    data-testid="send-email"
                    className="mt-0.5"
                  />
                  Send this email to the customer ({customerLocale.toUpperCase()})
                </label>
                <pre
                  data-testid="email-preview"
                  className="max-h-56 overflow-auto rounded-sm border border-border bg-card p-2.5 text-xs whitespace-pre-wrap"
                >
                  {`${preview.subject}\n\n${preview.text}`}
                </pre>
              </>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                data-testid="status-confirm"
                disabled={pending || blocked}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {pending ? "Saving…" : "Confirm"}
              </button>
              <button
                type="button"
                data-testid="status-cancel"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="submit"
            data-testid="status-save"
            disabled={pending}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save status"}
          </button>
        )}
      </form>

      {state?.error && (
        <p
          data-testid="status-error"
          role="alert"
          className="mt-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      )}
      {state?.notice && (
        <p
          data-testid="status-notice"
          role="status"
          className="mt-2 text-sm text-muted-foreground"
        >
          {state.notice}
        </p>
      )}
    </>
  );
}
