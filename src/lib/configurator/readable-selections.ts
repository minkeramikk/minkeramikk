import type { ConfigSnapshot } from "@/lib/cart/cart";

/**
 * F37 — the configured design's selections as one readable line. `withLabels`
 * (box desktop) → "Kanter: Verde Smeraldo · Detaljer: Alici"; omitted (strip
 * mobile) → "Verde Smeraldo · Alici". Label localised like the cart recap:
 * NO uses the canonical `label`, EN prefers `labelEn` and falls back to it.
 */
export function formatSelections(
  selections: ConfigSnapshot["selections"],
  locale: "no" | "en",
  opts: { withLabels?: boolean } = {}
): string {
  return selections
    .map((s) => {
      if (!opts.withLabels) return s.option;
      const label = locale === "no" ? s.label : (s.labelEn ?? s.label);
      return `${label}: ${s.option}`;
    })
    .join(" · ");
}
