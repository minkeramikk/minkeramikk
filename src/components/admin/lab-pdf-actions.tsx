"use client";

import { useActionState } from "react";
import { sendSupplierLabPdf, type LabSendState } from "@/app/admin/orders/lab-pdf-actions";

const initial: LabSendState = { ok: false, message: null };

/** Per-supplier production-order PDF: download (GET route) + send to workshop
 *  (server action with optional Resend). F08. */
export function LabPdfActions({
  orderId,
  supplierId,
}: {
  orderId: string;
  supplierId: string;
}) {
  const [state, formAction, pending] = useActionState(sendSupplierLabPdf, initial);

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="lab-pdf-actions">
      <a
        href={`/api/admin/orders/${orderId}/pdf?supplier=${supplierId}`}
        target="_blank"
        rel="noopener"
        data-testid="lab-pdf-download"
        className="h-8 rounded-lg border border-border px-3 text-xs font-medium leading-8 hover:bg-muted/50"
      >
        Download PDF
      </a>
      <form action={formAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="supplierId" value={supplierId} />
        <button
          type="submit"
          disabled={pending}
          data-testid="lab-pdf-send"
          className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send to workshop"}
        </button>
      </form>
      {state.message && (
        <span
          data-testid="lab-pdf-result"
          className={state.ok ? "text-xs text-muted-foreground" : "text-xs text-destructive"}
        >
          {state.message}
        </span>
      )}
    </div>
  );
}
