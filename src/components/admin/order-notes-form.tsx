"use client";

import { useActionState } from "react";
import { updateOrderNotes, type ActionResult } from "@/app/admin/orders/actions";

const initial: ActionResult = {};

/**
 * R4-FIX Ⓒ — the internal note saved silently: a plain `<form action>` on an
 * action that returned nothing. Same shape as order-message-form.tsx now
 * (useActionState + a status line), so the click has a visible outcome.
 *
 * Admin English-only (i18n rule 5).
 */
export function OrderNotesForm({
  orderId,
  notes,
}: {
  orderId: string;
  notes: string;
}) {
  const [state, formAction, pending] = useActionState(updateOrderNotes, initial);

  return (
    <form action={formAction} data-testid="notes-form" className="flex flex-col gap-2">
      <input type="hidden" name="id" value={orderId} />
      <textarea
        name="notes"
        data-testid="notes-input"
        rows={3}
        defaultValue={notes}
        placeholder="e.g. call back Thursday, wants delivery before Christmas…"
        className="w-full rounded-sm border border-input bg-card p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      />
      <button
        type="submit"
        data-testid="notes-save"
        disabled={pending}
        className="self-start rounded-lg border border-border bg-ink px-3 py-1.5 text-sm font-medium text-ink-foreground disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save note"}
      </button>
      {(state?.notice || state?.error) && (
        <p
          role="status"
          data-testid="notes-status"
          className={
            state.error ? "text-sm text-destructive" : "text-sm font-medium text-[var(--primary)]"
          }
        >
          {state.error ?? state.notice}
        </p>
      )}
    </form>
  );
}
