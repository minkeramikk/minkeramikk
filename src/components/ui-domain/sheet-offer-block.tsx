"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { add, formatMoney, money, multiply, percentOf, subtract, type Currency } from "@/lib/money/money";
import type { SheetOffer } from "@/lib/discounts/sheet-offer";

/**
 * R4-UPSELL-MODALE — the offer block above the product sheet's buy row
 * (DESIGN-SYSTEM §3.24, mockup `mockup-modale-upsell.html`).
 *
 * Presentational only: everything it needs is a prop, nothing is read from
 * context, so it can be reasoned about (and screenshotted) on its own. The
 * caller decides when it mounts — `offer === null` renders nothing, which is
 * how the product sheet stays byte-identical when there is no rule to show.
 *
 * Two states, never a third:
 *  - locked: the rule exists but the stepper hasn't reached it yet. ONE
 *    string carries both the explanation and the shortcut (D-Q2) — a second
 *    sentence next to it would be a second source of truth for a number the
 *    engine already computed as `offer.missing`.
 *  - unlocked: both bundle rows, always both (a deal's button adds the base
 *    pieces AND the extra ceramic — showing only the discounted row would
 *    let someone expecting the net price receive the whole bundle's bill).
 *    Row recipe reused from `cart-suggestion.tsx` / `cart-discount-row.tsx`,
 *    not restyled: `<s>` full price, net price, `cart.discount.badge` pill.
 *
 * TODO:nb-review NO copy: cart.sheetOffer.* (TL wording, D-Q1/D-Q2 rulings)
 */
export function SheetOfferBlock({
  offer,
  currentName,
  currentUnitPriceCents,
  currency,
  qty,
  locale,
  onSetQty,
  onAddBoth,
}: {
  offer: SheetOffer | null;
  currentName: string;
  currentUnitPriceCents: number;
  currency: Currency;
  qty: number;
  locale: "no" | "en";
  onSetQty: (next: number) => void;
  onAddBoth: () => void;
}) {
  const t = useTranslations("cart.sheetOffer");
  const tSuggestion = useTranslations("cart.suggestion");
  const tDiscount = useTranslations("cart.discount");

  if (!offer) return null;

  if (offer.kind === "locked") {
    return (
      <div
        data-testid="sheet-offer"
        className="rounded-sm border p-3"
        style={{
          backgroundColor: "color-mix(in oklab, var(--muted) 45%, var(--card))",
          borderColor: "color-mix(in oklab, var(--muted) 30%, var(--border))",
        }}
      >
        <div data-testid="sheet-offer-locked" className="flex flex-col items-start gap-1">
          <p className="text-[10px] font-semibold tracking-[.06em] text-muted-foreground uppercase">
            {t("kicker")}
          </p>
          <button
            type="button"
            data-testid="sheet-offer-unlock"
            onClick={() => onSetQty(offer.neededQty)}
            className="-mx-1 inline-flex min-h-11 items-center px-1 py-2 text-sm font-medium text-primary underline underline-offset-2 hover:text-foreground"
          >
            {t("unlock", { missing: offer.missing })}
          </button>
        </div>
      </div>
    );
  }

  // Unlocked: rule.suggested is guaranteed here — sheet-offer.ts (Task 1)
  // already refuses to return an unlocked offer whose card cannot be drawn.
  const { suggestion } = offer;
  const p = suggestion.rule.suggested;
  if (!p) return null;

  const unit = money(currentUnitPriceCents, currency);
  const base = multiply(unit, qty);

  const full = multiply(money(p.priceCents, p.currency), suggestion.rule.suggestedQty);
  const saved = suggestion.pct > 0 ? percentOf(full, suggestion.pct) : money(0, p.currency);
  const net = subtract(full, saved);
  const total = add(base, net);

  const suggestedName = locale === "no" ? p.nameNo : p.nameEn;

  return (
    <div
      data-testid="sheet-offer"
      className="rounded-sm border p-3"
      style={{
        backgroundColor: "color-mix(in oklab, var(--primary) 10%, var(--card))",
        borderColor: "color-mix(in oklab, var(--primary) 35%, var(--border))",
      }}
    >
      <p className="mb-2 text-[10px] font-semibold tracking-[.06em] text-primary uppercase">
        {t("kickerUnlocked")}
      </p>

      <div className="flex flex-col gap-1.5">
        <div
          data-testid="sheet-offer-base"
          className="flex items-baseline justify-between gap-2 text-sm tabular-nums"
        >
          <span className="min-w-0 truncate font-medium">
            {tSuggestion("qtyName", { qty, name: currentName })}
          </span>
          <span className="shrink-0">{formatMoney(base, locale)}</span>
        </div>

        <div
          data-testid="sheet-offer-extra"
          className="flex items-baseline justify-between gap-2 text-sm tabular-nums"
        >
          <span className="min-w-0 truncate font-medium">
            {tSuggestion("qtyName", { qty: suggestion.rule.suggestedQty, name: suggestedName })}
          </span>
          <span className="flex shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-0.5">
            {suggestion.pct > 0 && (
              <s aria-hidden="true" className="text-xs text-muted-foreground tabular-nums">
                {formatMoney(full, locale)}
              </s>
            )}
            <span>{formatMoney(net, locale)}</span>
            {suggestion.pct > 0 && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
                style={{
                  backgroundColor: "color-mix(in oklab, var(--discount) 16%, white)",
                  color: "color-mix(in oklab, var(--discount), black 34%)",
                  border: "1px solid color-mix(in oklab, var(--discount) 38%, white)",
                }}
              >
                {tDiscount("badge", { pct: suggestion.pct })}
              </span>
            )}
          </span>
        </div>
      </div>

      <Button
        data-testid="sheet-offer-add-both"
        onClick={onAddBoth}
        className="mt-3 min-h-11 w-full"
      >
        {t("addBoth", { total: formatMoney(total, locale) })}
      </Button>
    </div>
  );
}
