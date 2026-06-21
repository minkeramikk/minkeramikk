"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InfoIcon, XIcon } from "lucide-react";

/**
 * R2-4b — dedicated, click-only product-info popover. Built on the F13 portal
 * pattern (hover-preview.tsx) but INTERACTIVE: it takes focus, so it is a
 * `role="dialog"` anchored under the "i" trigger, not a pointer-events-none
 * tooltip. Focus is managed (moves in on open, returns to the trigger on
 * close); Esc and an outside pointerdown close it. The gesture is deliberately
 * separate from add-to-basket (Alessio 2026-06-18). Read-only content (text)
 * → a simple focus-in/return is enough; no Tab-cycle trap needed (YAGNI).
 */
export function InfoPopover({
  ariaLabel,
  title,
  closeLabel,
  triggerTestId = "product-info-trigger",
  testId = "product-info-popover",
  children,
}: {
  ariaLabel: string;
  title: string;
  closeLabel: string;
  triggerTestId?: string;
  testId?: string;
  children: React.ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  function openPopover() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    // anchored under the icon, left-aligned (icon sits top-left of the tile)
    setPos({ left: r.left, top: r.bottom + 6 });
    setOpen(true);
  }
  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  // focus into the popover when it opens
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  // Esc + outside pointerdown close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false); // outside click: no focus yank back to the trigger
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-testid={triggerTestId}
        onClick={() => (open ? close() : openPopover())}
        className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring sm:size-9"
      >
        <InfoIcon className="size-4" aria-hidden />
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={title}
            data-testid={testId}
            className="fixed z-50 max-w-72 rounded-lg border bg-card p-3 text-left text-sm shadow-(--shadow-card)"
            style={{ left: pos.left, top: pos.top }}
          >
            <div className="mb-1 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {title}
              </p>
              <button
                ref={closeRef}
                type="button"
                aria-label={closeLabel}
                data-testid="product-info-close"
                onClick={close}
                className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                <XIcon className="size-3.5" aria-hidden />
              </button>
            </div>
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
