import { cn } from "@/lib/utils";
import type { CartLayer } from "@/lib/cart/cart";

/**
 * F37 — round design preview (pattern only, no plate), the same "circle" the
 * customer saw at step 1–2. Reuses the CartLineThumb technique: the design
 * `layers` stacked as images, `multiply` on the recolour layers, over a light
 * tile — never composited onto a ceramic photo (that render doesn't exist).
 * Size comes from `className` (e.g. `size-14`, `size-9`, `size-20`). Layer
 * `src` values are already display-ready URLs (buildConfigLinePayload → assetUrl).
 */
export function DesignRound({
  layers,
  className,
}: {
  layers: CartLayer[];
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-testid="design-round"
      className={cn(
        "relative block shrink-0 overflow-hidden rounded-full border border-border bg-card",
        className
      )}
    >
      {layers.map((l, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- composited catalog art from storage
        <img
          key={`${l.src}-${i}`}
          src={l.src}
          alt=""
          className="absolute inset-0 size-full object-contain"
          style={l.recolor ? { mixBlendMode: "multiply" } : undefined}
        />
      ))}
    </span>
  );
}
