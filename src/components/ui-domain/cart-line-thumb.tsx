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
 *
 * `compact` puts the two side by side at 38px instead of stacked at 48
 * (DESIGN-SYSTEM §3.23, mockup variant A): in the offers list a stacked pair
 * made a 93px row and three of them a wall. Both images stay — the ceramic says
 * what you are buying, the design says what it wears — so neither is decoration
 * that could be dropped instead.
 */
export function CartLineThumb({
  layers,
  hex,
  plateImage,
  className,
  compact = false,
  unpainted = false,
}: {
  layers?: CartLayer[];
  hex?: string;
  plateImage?: string;
  className?: string;
  compact?: boolean;
  /** R5-UNPAINTED: no colours chosen yet — a dashed, empty square. The ceramic
   *  photo below stays: it is what the customer is buying either way. */
  unpainted?: boolean;
}) {
  const composed = !unpainted && layers && layers.length > 0;
  const box = compact ? "size-[38px]" : "size-12";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1",
        compact ? "flex-row" : "flex-col",
        className
      )}
    >
      <span
        aria-hidden
        data-testid={unpainted ? "cart-thumb-unpainted" : composed ? "cart-thumb" : "cart-thumb-chip"}
        className={cn(
          "relative block overflow-hidden rounded-md border",
          box,
          unpainted
            ? "border-dashed border-primary/50 bg-muted"
            : cn("border-border", composed ? "bg-[var(--mk-canvas)]" : "bg-muted")
        )}
        style={!unpainted && !composed && hex ? { backgroundColor: hex } : undefined}
      >
        {unpainted && (
          <span className="grid size-full place-items-center text-[16px] text-primary/60">◌</span>
        )}
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
          className={cn("rounded-md border border-border bg-[var(--mk-canvas)] object-contain p-1", box)}
        />
      )}
    </div>
  );
}
