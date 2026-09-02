"use client";

import { useTranslations } from "next-intl";
import type { Ladder } from "@/lib/discounts/ladder";
import { cn } from "@/lib/utils";

/**
 * R4-UPSELL-POST-ADD ① (DESIGN-SYSTEM §3.26) — the quantity scale, in the
 * product sheet, right above the buy row: the only place the customer picks a
 * number is the only place the scale can change their mind.
 *
 * Was a progress bar with markers, a «you save» headline and a nudge. Alessio,
 * 2/9: «troppo testo». It is now the STEP TABLE of his own screenshot
 * (`mockup-upsell-post-add.html`, binding) — one column per step and nothing
 * else: no bar, no dots, no «Du sparer», no nudge, no sticky hint.
 *
 * Presentational only — `ladder` arrives already computed over CART + SELECTOR
 * (`ladderFor`), so this file never has to know the cart exists.
 *
 * Three rules it must not break:
 *  - the FIRST column is always «1 stk / 0 %», the shop's own baseline: the
 *    scale is a price list before it is a discount, and a list that starts at
 *    the first discount hides what the plate costs on its own.
 *  - every step shows quantity AND percentage, reached or not. Emphasis comes
 *    from the box and the weight, never from presence.
 *  - NO column adds to the basket. The scale picks a quantity; adding is the
 *    CTA's job, and nobody else's.
 *
 * TODO:nb-review NO copy: configurator.ladder.*
 */
/**
 * What a column press puts on the SELECTOR. The scale counts cart + selector,
 * so landing ON `minQty` means asking for the difference — and never for less
 * than one, which is what a step already covered by the basket would ask for.
 *
 * ponytail: exported for one reason — the unit tests have no DOM (vitest.config
 * renders components to a string), so this is the only way the arithmetic gets
 * a real check instead of one that re-implements it.
 */
export const stepTargetQty = (minQty: number, inCart: number) => Math.max(1, minQty - inCart);

export function DiscountLadder({
  ladder,
  excluded,
  inCart,
  onSetQty,
}: {
  /** Null → nothing renders: no empty frame when there is no scale. */
  ladder: Ladder | null;
  /** The product is outside the discount multi-select: one line says so. */
  excluded: boolean;
  /** Pieces of this product ALREADY in the basket — a column press aims the
   *  selector at `minQty − inCart`, because the scale counts both. */
  inCart: number;
  onSetQty: (nextSelectorQty: number) => void;
}) {
  const t = useTranslations("configurator.ladder");

  if (excluded) {
    return (
      <p data-testid="ladder-excluded" className="text-xs text-muted-foreground">
        {t("excluded")}
      </p>
    );
  }
  if (!ladder) return null;

  const { steps } = ladder;
  /**
   * The column the customer is standing on: the HIGHEST step reached, or −1 for
   * the «1 stk» baseline when none is. Deliberately not `LadderStep.current`
   * (`qty === minQty`) — at 5 pieces on a 4·6·8 scale the customer IS on the
   * −5 % step, and a table that highlights nothing there reads as broken.
   */
  const at = steps.reduce((acc, s, i) => (s.state === "reached" ? i : acc), -1);

  // One column per step plus the baseline. Many steps → the row scrolls
  // sideways rather than squeezing the labels (same recipe as the old bar).
  const columns = steps.length + 1;

  const column = (i: number, minQty: number, pct: number) => {
    const current = i === at;
    return (
      <button
        key={minQty}
        type="button"
        data-testid={i < 0 ? "ladder-step-base" : "ladder-step"}
        aria-current={current ? "step" : undefined}
        disabled={current}
        // Pressable UP and DOWN: a control that only goes one way reads as
        // broken. It sets the SELECTOR so that cart + selector lands on the
        // column — never a cart addition.
        onClick={() => onSetQty(stepTargetQty(minQty, inCart))}
        // The baseline's own text ("1 stk 0 %") is its accessible name; the
        // tiers keep the fuller `ladder.step` phrasing they already had.
        aria-label={i < 0 ? undefined : t("step", { qty: minQty, pct })}
        className={cn(
          "relative flex flex-col items-center gap-1.5 rounded-[12px] px-0.5 pt-[9px] pb-2",
          "tabular-nums transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          !current && "cursor-pointer"
        )}
        style={
          current
            ? { background: "color-mix(in oklab, var(--primary) 14%, white)" }
            : undefined
        }
      >
        {/* «Mest valgt» sits on the FIRST tier and stays there (TL, 2/9): a
            constant, not an admin flag — moving it is a 30-minute card. */}
        {i === 0 && (
          <span
            data-testid="ladder-popular"
            className="absolute -top-[19px] left-1/2 -translate-x-1/2 rounded-lg px-2.5 py-[3px] text-[11px] font-medium whitespace-nowrap text-white"
            style={{ background: "color-mix(in oklab, var(--primary) 78%, white)" }}
          >
            {t("popular")}
          </span>
        )}
        <b className={cn("text-sm whitespace-nowrap", current ? "font-semibold" : "font-medium")}>
          {t("stepQty", { qty: minQty })}
        </b>
        <i className={cn("text-sm not-italic", current ? "font-semibold" : "font-medium")}>
          {t("stepPct", { pct })}
        </i>
      </button>
    );
  };

  return (
    <div data-testid="discount-ladder" className="border-t border-border pt-3">
      <div className="mb-[22px] flex items-baseline justify-between gap-2">
        <h3 className="text-[17px] font-semibold">{t("title")}</h3>
        {inCart > 0 && (
          <span
            data-testid="ladder-in-cart"
            className="rounded-full bg-muted px-2.5 py-[3px] text-[11.5px] whitespace-nowrap text-muted-foreground"
          >
            {t("inCartShort", { qty: inCart })}
          </span>
        )}
      </div>

      {/* pt-1.5: the «Mest valgt» tag sticks out above its column, and
          overflow-x:auto forces overflow-y:auto too — without the padding the
          scrollport would clip it. */}
      <div className="-mx-1 overflow-x-auto pt-1.5">
        <div
          className="grid auto-cols-fr grid-flow-col gap-1"
          style={{ minWidth: `max(100%, ${columns * 62}px)` }}
        >
          {column(-1, 1, 0)}
          {steps.map((s, i) => column(i, s.minQty, s.pct))}
        </div>
      </div>

      <p className="mt-4 mb-1 text-sm text-muted-foreground">{t("foot")}</p>
    </div>
  );
}
