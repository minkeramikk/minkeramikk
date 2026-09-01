"use client";

import { useActionState, useEffect, useState } from "react";
import { sendCustomerMessage, type ActionResult } from "@/app/admin/orders/actions";
import { defaultMessageSubject } from "@/lib/orders/custom-email";

const initial: ActionResult = {};

/**
 * R4-ORDERS-PLUS voce A — «Email the customer», where the `mailto:` link used
 * to be. Same pattern as the status form (order-status-form.tsx): a plain
 * button that expands an INLINE block inside the section, `useActionState`,
 * notice and error on screen. Not a modal: nothing else in this back-office is
 * one, and the block sits exactly where the link sat.
 *
 * The subject is prefilled and editable; the body is what leaves, through the
 * branded shell (custom-email.ts). The send is synchronous, so an error appears
 * here rather than in a log nobody reads.
 *
 * Admin English-only (i18n rule 5).
 */
export function OrderMessageForm({
  orderId,
  orderCode,
  customerEmail,
}: {
  orderId: string;
  orderCode: string;
  customerEmail: string;
}) {
  const [state, formAction, pending] = useActionState(sendCustomerMessage, initial);
  const [open, setOpen] = useState(false);

  // A sent message closes the box: leaving the text on screen invites a second
  // send of the same mail, which is the one mistake this control can make.
  useEffect(() => {
    if (state?.notice) setOpen(false);
  }, [state?.notice]);

  if (!open) {
    return (
      <>
        <button
          type="button"
          data-testid="email-customer"
          onClick={() => setOpen(true)}
          className="mt-2 block w-full rounded-lg border border-border px-3 py-2 text-center text-sm"
        >
          Email the customer
        </button>
        {state?.notice && (
          <p role="status" data-testid="message-notice" className="mt-2 text-sm font-medium text-[var(--primary)]">
            {state.notice}
          </p>
        )}
      </>
    );
  }

  return (
    <form
      action={formAction}
      data-testid="message-form"
      className="mt-2 flex flex-col gap-2.5 rounded-sm border border-border bg-muted/30 p-3"
    >
      <input type="hidden" name="id" value={orderId} />
      <p className="text-sm">
        To <strong>{customerEmail}</strong>
      </p>
      <label className="text-sm" htmlFor="message-subject">
        Subject
      </label>
      <input
        id="message-subject"
        name="subject"
        data-testid="message-subject"
        defaultValue={defaultMessageSubject(orderCode)}
        maxLength={200}
        className="h-9 rounded-sm border border-input bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      />
      <label className="text-sm" htmlFor="message-body">
        Message
      </label>
      <textarea
        id="message-body"
        name="body"
        data-testid="message-body"
        rows={6}
        maxLength={5000}
        placeholder="Hei Kari, …"
        className="w-full rounded-sm border border-input bg-card p-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      />
      <p className="text-xs text-muted-foreground">
        Sent from the shop&apos;s own address, in the same branded layout as the other
        emails. What you write here is what the customer reads.
      </p>
      <div className="flex gap-2">
        <button
          type="submit"
          data-testid="message-send"
          disabled={pending}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          data-testid="message-cancel"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
      {state?.error && (
        <p role="alert" data-testid="message-error" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
