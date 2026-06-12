"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * Shared hover/focus preview popup (R1-FB4) — the F13 Swatch pattern, verbatim,
 * extracted so the step-3 ceramic cards can reuse it:
 *   - portal on document.body → no ancestor overflow/stacking clipping;
 *   - `role="tooltip"`, pointer-events none → no layout shift, no flicker;
 *   - Esc closes; desktop-only via hoverCapable() (touch has no hover — the
 *     main preview / cart-row expansion covers "see it bigger" there).
 * Behaviour MUST stay identical for the Swatch (R1-FB4 AC3).
 */

export function hoverCapable(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: hover) and (pointer: fine)").matches
  );
}

export interface HoverPreviewState {
  open: boolean;
  pos: { left: number; top: number } | null;
  show: () => void;
  hide: () => void;
}

/**
 * Open/close + anchor position for a popup over `ref`. `enabled` gates the
 * whole thing (e.g. swatches without a previewSrc never open).
 */
export function useHoverPreview(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean
): HoverPreviewState {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = () => {
    if (!enabled || !hoverCapable()) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ left: r.left + r.width / 2, top: r.top });
    setOpen(true);
  };
  const hide = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return { open, pos, show, hide };
}

/**
 * R1-FB2 — warm the popup images while the browser is idle, so the FIRST
 * hover doesn't pay fetch+decode (post-F26.1 a @512 variant is ~20–30 KiB;
 * a whole design is ~0.5 MB at low priority).
 *
 * Desktop-only (hoverCapable: on touch the popup doesn't exist → zero bytes),
 * in idle (requestIdleCallback, setTimeout fallback), fetchPriority low —
 * never competes with the hero preload (F14/F26.1, untouched). A module-level
 * Set survives step/design changes: already-warmed URLs are never re-fetched.
 * Callers pass a useMemo'd array.
 */
const warmed = new Set<string>();

export function useWarmupPreviews(urls: (string | null | undefined)[]) {
  useEffect(() => {
    if (!hoverCapable()) return;
    const fresh = urls.filter((u): u is string => Boolean(u) && !warmed.has(u!));
    if (fresh.length === 0) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      for (const u of fresh) {
        if (warmed.has(u)) continue;
        warmed.add(u);
        const img = new Image();
        img.fetchPriority = "low";
        img.decoding = "async";
        img.src = u;
      }
    };
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(run);
    return () => {
      cancelled = true;
      cancel(id);
    };
  }, [urls]);
}

/** The floating card itself; render children (image, caption…) inside. */
export function HoverPreviewCard({
  state,
  testId,
  children,
}: {
  state: HoverPreviewState;
  testId: string;
  children: React.ReactNode;
}) {
  if (!state.open || !state.pos || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="tooltip"
      data-testid={testId}
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg border bg-card p-2 shadow-(--shadow-card)"
      style={{ left: state.pos.left, top: state.pos.top - 8 }}
    >
      {children}
    </div>,
    document.body
  );
}
