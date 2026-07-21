"use client";

import type { ReactNode } from "react";
import { GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import type { ReorderStatus as Status } from "./use-reorder";

/**
 * Live region for a reorder list: Saving/Saved/rolled-back, plus the sr-only
 * move announcement. `children` carries whatever else the list wants in the same
 * region (the products list puts its delete error there).
 */
export function ReorderStatus({
  status,
  announce,
  testidPrefix,
  children,
}: {
  status: Status;
  announce: string;
  testidPrefix: string;
  children?: ReactNode;
}) {
  return (
    <span
      className="text-xs"
      role="status"
      aria-live="polite"
      data-testid={`${testidPrefix}-order-status`}
    >
      {status === "saving" && <span className="text-muted-foreground">Saving…</span>}
      {status === "saved" && (
        <span className="text-[var(--primary)]" data-testid={`${testidPrefix}-order-saved`}>
          Saved ✓
        </span>
      )}
      {status === "error" && (
        <span className="text-destructive" data-testid={`${testidPrefix}-order-error`}>
          Could not save the new order — the list was put back.
        </span>
      )}
      {children}
      {/* Announced alongside the status, never instead of it. */}
      <span className="sr-only">{announce}</span>
    </span>
  );
}

/**
 * Drag handle + keyboard/touch fallback arrows, shared by the product and design
 * order lists (F39 / R-EXTRA). The fallback is secondary, but never removed (a11y).
 *
 * aria-disabled, not disabled: the row that just reached the top disables its own
 * ↑ in the same commit, and a disabled element cannot hold focus — the browser
 * would drop the keyboard user to <body> exactly when they finish moving an item.
 * 24px box min (WCAG 2.2 SC 2.5.8); the icon alone is 14px.
 *
 * @param testidPrefix keeps the existing e2e selectors ("product-move-up", …)
 */
export function ReorderControls({
  index,
  count,
  label,
  onMove,
  testidPrefix,
}: {
  index: number;
  count: number;
  label: string;
  onMove: (from: number, to: number) => void;
  testidPrefix: string;
}) {
  return (
    <>
      <span
        className="cursor-grab text-muted-foreground active:cursor-grabbing"
        aria-hidden
        data-testid={`${testidPrefix}-drag-handle`}
      >
        <GripVertical className="size-4" />
      </span>

      <span className="flex flex-col">
        <button
          type="button"
          aria-disabled={index === 0}
          onClick={() => {
            if (index > 0) onMove(index, index - 1);
          }}
          aria-label={`Move ${label} up`}
          data-testid={`${testidPrefix}-move-up`}
          className="flex size-6 items-center justify-center rounded-sm text-muted-foreground aria-disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          type="button"
          aria-disabled={index === count - 1}
          onClick={() => {
            if (index < count - 1) onMove(index, index + 1);
          }}
          aria-label={`Move ${label} down`}
          data-testid={`${testidPrefix}-move-down`}
          className="flex size-6 items-center justify-center rounded-sm text-muted-foreground aria-disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ChevronDown className="size-3.5" />
        </button>
      </span>
    </>
  );
}
