/**
 * Discount ratification badge (DESIGN-SYSTEM §3.3): same soft recipe as
 * PaidBadge — token tinted at 16% on white, darkened text, 38% border.
 * Ratified uses the `--discount` token (Task 4, R4-SCONTI); indicative stays
 * muted, so an un-ratified discount reads as a neutral fact, not an error.
 */
export function DiscountRatifiedBadge({ ratifiedAt }: { ratifiedAt: string | null }) {
  const token = ratifiedAt ? "var(--discount)" : "var(--muted-foreground)";
  return (
    <span
      data-testid="discount-badge"
      data-ratified={ratifiedAt ? "1" : "0"}
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{
        backgroundColor: `color-mix(in oklab, ${token} 16%, white)`,
        color: `color-mix(in oklab, ${token}, black 34%)`,
        border: `1px solid color-mix(in oklab, ${token} 38%, white)`,
      }}
    >
      {ratifiedAt ? "Ratified" : "Indicative"}
    </span>
  );
}
