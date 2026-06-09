import { cn } from "@/lib/utils";
import type { CartLayer } from "@/lib/cart/cart";

/**
 * Mini design preview for a cart row (F19). Re-renders the line's stored DESIGN
 * `layers` as stacked images (multiply for the recolour layers) over a light
 * tile — the same technique as PreviewCanvas (ADR 0002), no plate base, so the
 * centre stays clean like the step 1–2 preview. The chosen ceramic is shown as
 * a small separate thumbnail underneath.
 *
 * Backward-compatible: a line saved before F19 has no `layers`, so we fall back
 * to the colour chip (first selection hex) — no crash, no migration.
 */
export function CartLineThumb({
  layers,
  hex,
  plateImage,
  className,
}: {
  layers?: CartLayer[];
  hex?: string;
  plateImage?: string;
  className?: string;
}) {
  const composed = layers && layers.length > 0;

  return (
    <div className={cn("flex shrink-0 flex-col items-center gap-1", className)}>
      <span
        aria-hidden
        data-testid={composed ? "cart-thumb" : "cart-thumb-chip"}
        className={cn(
          "relative block size-12 overflow-hidden rounded-md border border-border",
          composed ? "bg-card" : "bg-muted"
        )}
        style={!composed && hex ? { backgroundColor: hex } : undefined}
      >
        {composed &&
          layers.map((l, i) => (
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
      {plateImage && (
        // eslint-disable-next-line @next/next/no-img-element -- chosen ceramic photo from storage
        <img
          src={plateImage}
          alt=""
          aria-hidden
          data-testid="cart-plate"
          className="size-12 rounded-md border border-border bg-card object-contain p-1"
        />
      )}
    </div>
  );
}
