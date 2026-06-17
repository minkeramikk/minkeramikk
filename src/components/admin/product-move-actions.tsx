"use client";

import { moveProduct } from "@/app/admin/products/actions";

/**
 * ↑↓ reorder arrows for the /admin/products list — same pattern as the F28
 * featured rows (no numeric Sort-order field needed for day-to-day reorder).
 * Direction travels via .bind: React does NOT forward the submitter button's
 * name/value to plain form server actions.
 */
export function ProductMoveActions({
  id,
  isFirst,
  isLast,
}: {
  id: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <form className="flex flex-col gap-0.5">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        formAction={moveProduct.bind(null, "up")}
        aria-label="Move up"
        data-testid="product-move-up"
        disabled={isFirst}
        className="flex size-7 items-center justify-center rounded-sm border border-border text-xs hover:border-ring disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="submit"
        formAction={moveProduct.bind(null, "down")}
        aria-label="Move down"
        data-testid="product-move-down"
        disabled={isLast}
        className="flex size-7 items-center justify-center rounded-sm border border-border text-xs hover:border-ring disabled:opacity-30"
      >
        ↓
      </button>
    </form>
  );
}
