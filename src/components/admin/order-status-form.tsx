"use client";

import { useActionState, useEffect, useState } from "react";
import { updateOrderStatus } from "@/app/admin/orders/actions";
import {
  ORDER_STATUSES,
  STATUS_LABEL,
  type OrderStatus,
} from "@/lib/orders/order-status";

/**
 * F07b — controlled status form.
 *
 * Fixes:
 * 1. Controlled <select> (value + useEffect sync) so the displayed value always
 *    matches what's in the DB after every save, including backward transitions.
 * 2. Inline confirmation step before the server action fires — selecting a new
 *    status and clicking "Save status" shows "Change from X to Y? Confirm/Cancel".
 *    Only the "Confirm" button actually submits.
 * 3. useActionState wires the server action so Supabase errors surface in the UI
 *    instead of being silently swallowed.
 */
export function OrderStatusForm({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: OrderStatus;
}) {
  const [state, formAction, pending] = useActionState(updateOrderStatus, {});
  const [selected, setSelected] = useState<OrderStatus>(currentStatus);
  const [confirming, setConfirming] = useState(false);

  // Sync the controlled value whenever RSC delivers a fresh currentStatus after
  // a successful save (or a failed one that left it unchanged).
  useEffect(() => {
    setSelected(currentStatus);
    setConfirming(false);
  }, [currentStatus]);

  /**
   * Intercept the first submit to show the confirmation step.
   * On the second submit (from the "Confirm" button inside the confirmation
   * block), confirming is already true → we don't prevent → React's formAction
   * takes over and calls the server action.
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
              Change status from{" "}
              <strong>{STATUS_LABEL[currentStatus]}</strong> to{" "}
              <strong>{STATUS_LABEL[selected]}</strong>?
            </p>
            <div className="flex gap-2">
              <button
                type="submit"
                data-testid="status-confirm"
                disabled={pending}
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
    </>
  );
}
