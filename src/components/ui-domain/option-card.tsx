"use client";

import { cn } from "@/lib/utils";
import { SupplierBadge } from "./supplier-badge";

/**
 * Selectable option in the configurator grids (DESIGN-SYSTEM §3.9).
 * Selecting a design locks the supplier for the item (ADR 0007).
 */
export function OptionCard({
  label,
  supplierName,
  imageUrl,
  layers,
  selected = false,
  onSelect,
}: {
  label: string;
  supplierName?: string;
  imageUrl?: string;
  /**
   * CA-7: composited design plate for the step-1 "design as a button" cards —
   * the same default layers the preview/featured-strip use (recolor = multiply
   * blend). Resolved to URLs by the caller. Takes precedence over `imageUrl`.
   */
  layers?: { src: string; recolor?: boolean }[];
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "min-h-11 rounded-sm border-[1.5px] px-2.5 py-3 text-center text-sm transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        selected
          ? "border-primary bg-primary font-semibold text-primary-foreground"
          : "border-border bg-card text-foreground hover:border-ring",
      )}
    >
      {layers && layers.length > 0 ? (
        // CA-7: stack the design's default layers into a round plate preview,
        // exactly like the featured strip / admin starters (multiply for the
        // tinted pattern layers). Decorative — the label carries the name.
        <span
          data-testid="design-plate"
          // ALWAYS a light tile: the layers blend with `multiply`, which needs a
          // light backdrop to read — on the selected card's primary fill it would
          // turn muddy. A clean plate on a tinted card frames the selection well.
          className="relative mx-auto mb-2 block aspect-square w-full overflow-hidden rounded-full bg-card"
        >
          {layers.map((l, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- composited catalog art from storage
            <img
              key={`${l.src}-${i}`}
              src={l.src}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              className="absolute inset-[6%] h-[88%] w-[88%] object-contain"
              style={l.recolor ? { mixBlendMode: "multiply" } : undefined}
            />
          ))}
        </span>
      ) : (
        imageUrl && (
        // F15 (§3.9): show the ORIGINAL curated art as-is (white+purple) on a
        // tinted tile — muted normally, primary when selected — so the artwork
        // reads on both states. No mask/currentColor (that flattened it to a
        // monochrome silhouette in F13).
        <span
          data-testid="option-icon"
          className={cn(
            "mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-sm",
            selected ? "bg-primary-foreground/15" : "bg-muted",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- catalog art from storage */}
          <img
            src={imageUrl}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            className="h-14 w-14 object-contain"
          />
        </span>
        )
      )}
      <span className="block">{label}</span>
      {supplierName && (
        <SupplierBadge name={supplierName} onSelected={selected} className="mt-1.5" />
      )}
    </button>
  );
}
