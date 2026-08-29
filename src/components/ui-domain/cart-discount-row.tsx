"use client";

import { useTranslations } from "next-intl";
import { formatMoney } from "@/lib/money/money";
import { nextTier, type DiscountTier, type LineDiscount } from "@/lib/discounts/discount";

/**
 * R4-SCONTI (DESIGN-SYSTEM §3.22) — the discounted price cell and the per-line
 * nudge, shared by CartDrawer (§3.12) and DockedCart (§3.14).
 *
 * TODO:nb-review — the `cart.discount.*` Norwegian copy is the TL's wording
 * (`badge`, `badgeCapped`, `inCart`, `applied`, `nudge`, `srNowLabel`).
 *
 * `d` is looked up 1:1 as `discount.perLine[line.id]` at both call sites, from
 * the very same `cart` array `computeCartDiscount` was just run over in the
 * same render (`cart-context.tsx`) — so it is never undefined in practice,
 * unlike the nudge's `?.pct ?? 0`, which reads a *different* map keyed by
 * product, not line.
 */
export function CartLinePrice({
  d,
  locale,
}: {
  d: LineDiscount;
  locale: "no" | "en";
}) {
  const t = useTranslations("cart.discount");
  if (d.pct === 0) {
    return (
      <span
        data-testid="cart-line-net"
        className="text-right text-sm font-medium tabular-nums"
      >
        {formatMoney(d.full, locale)}
      </span>
    );
  }
  return (
    <span className="flex flex-col items-end gap-0.5">
      {/* aria-hidden: a screen reader that doesn't honour <s> semantics would
          otherwise announce the crossed-out full price with nothing marking
          it as superseded — the net price below carries its own sr-only
          "Now:" prefix so the charged amount stays unambiguous. */}
      <s
        aria-hidden="true"
        data-testid="cart-line-full"
        className="text-xs text-muted-foreground tabular-nums"
      >
        {formatMoney(d.full, locale)}
      </s>
      <span data-testid="cart-line-net" className="text-sm font-medium tabular-nums">
        <span className="sr-only">{t("srNowLabel")} </span>
        {formatMoney(d.net, locale)}
      </span>
      <span
        data-testid="cart-discount-badge"
        className="rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
        style={{
          backgroundColor: "color-mix(in oklab, var(--discount) 16%, white)",
          color: "color-mix(in oklab, var(--discount), black 34%)",
          border: "1px solid color-mix(in oklab, var(--discount) 38%, white)",
        }}
      >
        {/* A deal covers at most the rule's suggestedQty (ADR 0023), so on a
            line the customer has grown past the offer a bare «−50%» would be a
            lie about the line total. Say what is true — «−50% on 4 pcs» — and
            leave the rest at full price; an "effective" percentage computed
            over the whole line is arithmetic no shopper reads. */}
        {d.coveredQty < d.quantity
          ? t("badgeCapped", { pct: d.pct, qty: d.coveredQty })
          : t("badge", { pct: d.pct })}
      </span>
    </span>
  );
}

/**
 * «4 of this ceramic in your basket → −5% · add 2 more → 8%».
 *
 * `eligible` is the engine's own `LineDiscount.tierEligible` — the single
 * source of truth for whether the tier scale applies to THIS line. It must be
 * asked rather than re-derived: `discountConfig.tiers` is loaded by the server
 * whether or not the feature is switched on, so a nudge reading the scale
 * directly kept promising "add 4 more → 15%" with the tiers off, and kept
 * advertising a worse tier on a line already holding a better deal.
 */
export function CartDiscountNudge({
  productQty,
  tiers,
  pct,
  eligible,
}: {
  productQty: number;
  tiers: DiscountTier[];
  pct: number;
  eligible: boolean;
}) {
  const t = useTranslations("cart.discount");
  const up = nextTier(productQty, tiers);
  if (!eligible) return null;
  if (productQty === 0 || (pct === 0 && !up)) return null;
  return (
    <p data-testid="cart-discount-nudge" className="mt-1 text-[11px] text-muted-foreground">
      {t("inCart", { qty: productQty })}
      {pct > 0 && <> → {t("applied", { pct })}</>}
      {up && (
        <>
          {" · "}
          <span className="font-medium text-primary">
            {t("nudge", { missing: up.minQty - productQty, pct: up.pct })}
          </span>
        </>
      )}
    </p>
  );
}
