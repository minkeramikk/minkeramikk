"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { formatMoney, money, multiply, percentOf, subtract } from "@/lib/money/money";
import type { ActiveSuggestion } from "@/lib/discounts/discount";

/**
 * R4-UPSELL-POST-ADD ②/③ (DESIGN-SYSTEM §3.24) — the offers, as VISUAL CARDS,
 * in the post-add panel.
 *
 * It used to live in the product sheet, above the buy row, as a compact list of
 * text rows: kicker, «Legger til 4 Prete + 1 Vietri (…)» and a button reading
 * «Legg til 4+1». Alessio, 2/9: nobody decodes «4+1». So the block moved OUT of
 * the sheet and behind the add: by the time it is on screen the base is already
 * in the basket, so a button can only ever add the suggested ceramic — the
 * «4+1» is gone by construction, not by copy. The file keeps its name because
 * the component is the same one, reused where it now belongs.
 *
 * Consequences of the move, and the reason this file lost half its size:
 *  - no LOCKED state. Below the threshold the offer does not exist on screen at
 *    all (Alessio 2/9, superseding R4-UPSELL-MODALE AC1), so there is nothing
 *    to draw dimmed and no `neededQty` to explain;
 *  - no `baseQty`, no `onSetQty`. The panel does not own a quantity;
 *  - the offers are plain `ActiveSuggestion`s over the REAL cart — the same
 *    values the cart's own suggestion cards read (`cart-context`), so there is
 *    no second projection of the engine to keep honest.
 *
 * Presentational only: everything arrives by prop, nothing from context, so it
 * can be reasoned about — and screenshotted — on its own. An empty list renders
 * nothing at all.
 *
 * §D.2 survives the move: a taken offer STAYS on screen, marked with the ✓ disc
 * and no longer pressable, and taking one does not close anything — the
 * customer may want the others too.
 *
 * TODO:nb-review NO copy: cart.added.add
 */
export function SheetOfferBlock({
  offers,
  locale,
  takenRuleIds,
  onTake,
}: {
  /** Every offer the cart unlocks right now, in the admin's own order. */
  offers: ActiveSuggestion[];
  locale: "no" | "en";
  /** Rules already taken in this panel: marked, not pressable. */
  takenRuleIds: string[];
  onTake: (offer: ActiveSuggestion) => void;
}) {
  const t = useTranslations("cart.added");
  const tOffer = useTranslations("cart.sheetOffer");
  const tSuggestion = useTranslations("cart.suggestion");
  const tDiscount = useTranslations("cart.discount");

  if (offers.length === 0) return null;

  return (
    <div data-testid="sheet-offer">
      <p className="mb-2.5 text-[10px] font-semibold tracking-[.06em] text-primary uppercase">
        {tSuggestion("kicker")}
      </p>

      {/* Two columns at EVERY width (card): the centred dialog is not wide
          enough for a third without the photos going postage-stamp. */}
      <ul className="grid grid-cols-2 gap-2.5">
        {offers.map((offer) => {
          const p = offer.rule.suggested;
          // Guaranteed by the caller, which drops an undrawable offer; the
          // narrowing is for the type, not for a case that can happen.
          if (!p) return null;

          const qty = offer.rule.suggestedQty;
          const full = multiply(money(p.priceCents, p.currency), qty);
          const net = subtract(full, percentOf(full, offer.pct));
          const name = locale === "no" ? p.nameNo : p.nameEn;
          const taken = takenRuleIds.includes(offer.rule.id);

          return (
            <li
              key={offer.rule.id}
              data-testid="sheet-offer-row"
              className="flex flex-col overflow-hidden rounded-sm border border-border bg-card"
            >
              <div className="relative grid aspect-square place-items-center bg-muted">
                {p.image && (
                  /* eslint-disable-next-line @next/next/no-img-element -- catalog art from storage */
                  <img
                    src={p.image}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    className="size-full object-cover"
                  />
                )}
                {/* Same badge recipe as the cart rows and the sheet's unit
                    price — reused, never restyled. */}
                <span
                  className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
                  style={{
                    backgroundColor: "color-mix(in oklab, var(--discount) 16%, white)",
                    color: "color-mix(in oklab, var(--discount), black 34%)",
                    border: "1px solid color-mix(in oklab, var(--discount) 38%, white)",
                  }}
                >
                  {tDiscount("badge", { pct: offer.pct })}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-1 px-2.5 pt-2 pb-2.5">
                <b className="text-[13px] leading-snug font-semibold">
                  {tSuggestion("qtyName", { qty, name })}
                </b>
                <span className="text-[13px] tabular-nums">
                  <s aria-hidden="true" className="mr-1.5 text-xs text-muted-foreground">
                    {formatMoney(full, locale)}
                  </s>
                  <span className="sr-only">{tDiscount("srNowLabel")} </span>
                  {formatMoney(net, locale)}
                </span>

                {taken ? (
                  <span
                    data-testid="sheet-offer-taken"
                    className="mt-auto grid min-h-9 w-full place-items-center rounded-full text-sm font-semibold"
                    style={{
                      backgroundColor: "color-mix(in oklab, var(--discount) 18%, white)",
                      color: "color-mix(in oklab, var(--discount), black 36%)",
                      border: "1px solid color-mix(in oklab, var(--discount) 40%, white)",
                    }}
                  >
                    <span aria-hidden>✓</span>
                    <span className="sr-only">{tOffer("taken")}</span>
                  </span>
                ) : (
                  <Button
                    data-testid="sheet-offer-add"
                    onClick={() => onTake(offer)}
                    className="mt-auto min-h-9 w-full rounded-full px-3 text-[12.5px] tabular-nums"
                  >
                    {t("add", { total: formatMoney(net, locale) })}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
