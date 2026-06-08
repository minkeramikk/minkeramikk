"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Color option (kind=color, ADR 0004). The ONLY place where a raw hex reaches
 * the UI: it is catalog data, not theme. Rendered inside a radiogroup; ≥44px.
 *
 * F13 — "glaze" texture (DESIGN-SYSTEM §3.10): over the hex fill sit two shared,
 * colour-agnostic procedural overlays (feTurbulence, zero assets):
 *   1. dark grain in `multiply` (~0.45) — the relief/graininess;
 *   2. white speckle in `screen` (~0.9, sparse dots) — the glaze flecks.
 * The colour stays from `hex`; only the texture comes from the overlays.
 *
 * F13 — `with-preview`: on hover AND keyboard focus a floating card shows the
 * option's `layer_image` (the pattern in that colour). Rendered in a portal so
 * no ancestor's overflow/stacking context can clip it; no layout shift; Esc
 * closes; desktop-only (no hover on touch — there the main PreviewCanvas updates).
 */

// dark grayscale grain, tiled — darkens via multiply
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='90' height='90'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.5' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>`
)}")`;

// sparse white flecks on transparent — lightens via screen
const SPECKLE = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='90' height='90'><filter id='s'><feTurbulence type='fractalNoise' baseFrequency='0.55' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncR type='linear' slope='3' intercept='-1.3'/><feFuncG type='linear' slope='3' intercept='-1.3'/><feFuncB type='linear' slope='3' intercept='-1.3'/><feFuncA type='discrete' tableValues='0 0 0 0 1'/></feComponentTransfer></filter><rect width='100%' height='100%' filter='url(#s)'/></svg>`
)}")`;

function hoverCapable(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: hover) and (pointer: fine)").matches
  );
}

export function Swatch({
  hex,
  name,
  selected = false,
  onSelect,
  imageSrc,
  previewSrc,
  previewAlt,
  tabIndex,
}: {
  hex: string;
  name: string;
  selected?: boolean;
  onSelect?: () => void;
  /**
   * F15 — real glaze-photo swatch (options.image). When present it IS the
   * swatch (identical to the original site). Absent → the procedural grain
   * (F13) over `hex` is the placeholder; flat `hex` is the last fallback.
   */
  imageSrc?: string;
  /** layer_image (pattern in this colour) shown in the hover/focus popup. */
  previewSrc?: string;
  previewAlt?: string;
  tabIndex?: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = () => {
    if (!previewSrc || !hoverCapable()) return;
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

  return (
    <>
      <button
        ref={ref}
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={name}
        title={name}
        tabIndex={tabIndex}
        onClick={onSelect}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={{ backgroundColor: hex }}
        className={cn(
          "relative size-11 overflow-hidden rounded-full border-2 border-card transition-shadow",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          selected
            ? "shadow-[0_0_0_2.5px_var(--ring)]"
            : "shadow-[0_0_0_1.5px_var(--border)]"
        )}
      >
        {imageSrc ? (
          // real glaze-photo swatch (F15): the curated original asset, used as-is
          // eslint-disable-next-line @next/next/no-img-element -- catalog art from storage
          <img
            src={imageSrc}
            alt=""
            aria-hidden
            data-testid="swatch-photo"
            className="pointer-events-none absolute inset-0 size-full object-cover"
          />
        ) : (
          // placeholder (F13): procedural glaze grain over the hex fill
          <>
            <span
              aria-hidden
              data-testid="swatch-grain"
              className="pointer-events-none absolute inset-0"
              style={{ backgroundImage: GRAIN, backgroundSize: "cover", mixBlendMode: "multiply", opacity: 0.45 }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ backgroundImage: SPECKLE, backgroundSize: "cover", mixBlendMode: "screen", opacity: 0.9 }}
            />
          </>
        )}
      </button>

      {open &&
        pos &&
        previewSrc &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            data-testid="swatch-preview"
            className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg border bg-card p-2 shadow-(--shadow-card)"
            style={{ left: pos.left, top: pos.top - 8 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- catalog art from storage */}
            <img
              src={previewSrc}
              alt={previewAlt ?? name}
              className="size-32 object-contain"
            />
            <span className="mt-1 block text-center text-xs font-medium">
              {name}
            </span>
          </div>,
          document.body
        )}
    </>
  );
}
