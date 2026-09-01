"use client";

import { useTranslations } from "next-intl";
import {
  formatMoney,
  money,
  multiply,
  percentOf,
  type Currency,
  type Money,
} from "@/lib/money/money";
import type { Ladder } from "@/lib/discounts/ladder";
import { cn } from "@/lib/utils";

/**
 * R4-SCONTI-2 §C (DESIGN-SYSTEM §3.26) — the quantity scale, in the product
 * sheet, right above the buy row: the only place the customer picks a number is
 * the only place the scale can change their mind.
 *
 * Presentational only — `ladder` arrives already computed over CART + SELECTOR
 * (`ladderFor`), so this file never has to know the cart exists.
 *
 * Two rules it must not break:
 *  - every step always shows quantity AND percentage, reached or not: the scale
 *    is also the price list the shop asked to publish. Emphasis comes from
 *    colour and weight, never from presence.
 *  - NO step adds to the basket. The scale picks a quantity; adding is the CTA's
 *    job and the offers', and nobody else's.
 *
 * TODO:nb-review NO copy: configurator.ladder.*
 */

/** The money a step is worth on the whole quantity — the hero number is kroner,
 *  never the percentage: «−8 %» is abstract, kroner is why anyone adds two more. */
const savedAt = (unitPriceCents: number, currency: Currency, qty: number, pct: number): Money =>
  percentOf(multiply(money(unitPriceCents, currency), qty), pct);

export function DiscountLadder({
  ladder,
  excluded,
  unitPriceCents,
  currency,
  locale,
  inCart,
  onSetQty,
}: {
  /** Null → nothing renders: no empty frame when there is no scale. */
  ladder: Ladder | null;
  /** The product is outside the discount multi-select: one line says so. */
  excluded: boolean;
  unitPriceCents: number;
  currency: Currency;
  locale: "no" | "en";
  /** Pieces of this product ALREADY in the basket — a step press aims the
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

  const { steps, qty, pct, next, fill } = ladder;
  const top = steps[steps.length - 1];

  return (
    <div
      data-testid="discount-ladder"
      className="rounded-sm border border-border bg-card px-3 py-2.5"
    >
      <div className="mb-3 flex items-baseline justify-between gap-2.5">
        <span className="text-[10px] font-semibold tracking-[.06em] text-muted-foreground uppercase">
          {t("title")}
        </span>
        {pct > 0 ? (
          <span
            data-testid="ladder-save"
            className="text-sm font-semibold tabular-nums"
            style={{ color: "color-mix(in oklab, var(--discount), black 38%)" }}
          >
            {t("save", { amount: formatMoney(savedAt(unitPriceCents, currency, qty, pct), locale) })}
          </span>
        ) : (
          <span data-testid="ladder-save" className="text-xs text-muted-foreground">
            {t("saveUpTo", { pct: top.pct })}
          </span>
        )}
      </div>

      {/* Many steps → the row scrolls sideways; no label is ever squeezed. */}
      <div className="overflow-x-auto pb-px">
        <div style={{ minWidth: `max(100%, ${steps.length * 62}px)` }}>
          <div
            className="relative mx-3 h-1.5 rounded-full"
            style={{ background: "color-mix(in oklab, var(--foreground) 9%, var(--background))" }}
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200 ease-out"
              style={{ width: `${fill}%`, background: "var(--discount)" }}
            />
            {steps.map((s) => (
              <button
                key={s.minQty}
                type="button"
                data-testid="ladder-step"
                disabled={s.current}
                // Pressable UP and DOWN: a control that only goes one way reads
                // as broken. It sets the SELECTOR so that cart + selector lands
                // on the step — never a cart addition.
                onClick={() => onSetQty(Math.max(1, s.minQty - inCart))}
                aria-label={t("step", { qty: s.minQty, pct: s.pct })}
                className={cn(
                  "absolute top-1/2 grid size-[15px] -translate-x-1/2 -translate-y-1/2 place-items-center",
                  "rounded-full border-2 text-[9px] leading-none outline-none",
                  "focus-visible:ring-3 focus-visible:ring-ring/50",
                  s.state === "next" && "size-[17px] border-[3px]",
                  !s.current && "cursor-pointer"
                )}
                style={{
                  left: `${s.position}%`,
                  background: s.state === "reached" ? "var(--discount)" : "var(--background)",
                  borderColor:
                    s.state === "reached"
                      ? "var(--discount)"
                      : s.state === "next"
                        ? "var(--primary)"
                        : "color-mix(in oklab, var(--foreground) 22%, var(--background))",
                  color: s.state === "reached" ? "white" : "transparent",
                  boxShadow:
                    s.state === "next"
                      ? "0 0 0 4px color-mix(in oklab, var(--primary) 13%, transparent)"
                      : undefined,
                }}
              >
                ✓
              </button>
            ))}
          </div>

          {/* Quantity AND percentage on every step, reached or not. */}
          <div className="relative mx-3 mt-2.5 h-[30px]">
            {steps.map((s) => (
              <span
                key={s.minQty}
                className="absolute -translate-x-1/2 text-center leading-tight whitespace-nowrap tabular-nums"
                style={{
                  left: `${s.position}%`,
                  color:
                    s.state === "reached"
                      ? "color-mix(in oklab, var(--discount), black 38%)"
                      : s.state === "next"
                        ? "var(--primary)"
                        : "var(--muted-foreground)",
                }}
              >
                <b
                  className={cn(
                    "block text-xs",
                    s.state === "future" ? "font-medium" : "font-semibold"
                  )}
                >
                  {s.minQty}
                </b>
                <i className="block text-[10.5px] not-italic">−{s.pct}%</i>
              </span>
            ))}
          </div>
        </div>
      </div>

      {next ? (
        <p
          data-testid="ladder-nudge"
          className={cn("mt-2.5 text-[12.5px]", pct === 0 && "text-muted-foreground")}
          style={
            pct > 0
              ? { color: "color-mix(in oklab, var(--discount), black 38%)" }
              : next.minQty - qty <= 2
                ? { color: "var(--primary)", fontWeight: 500 }
                : undefined
          }
        >
          {t("nudge", {
            missing: next.minQty - qty,
            amount: formatMoney(
              savedAt(unitPriceCents, currency, next.minQty, next.pct),
              locale
            ),
          })}
        </p>
      ) : (
        pct > 0 && (
          <p
            data-testid="ladder-nudge"
            className="mt-2.5 text-[12.5px] font-medium"
            style={{ color: "color-mix(in oklab, var(--discount), black 38%)" }}
          >
            {t("best")}
          </p>
        )
      )}
    </div>
  );
}

/**
 * The same nudge, compacted into the sheet's sticky buy zone on mobile only.
 * The buy row is sticky and the scale is not: without this the customer changes
 * the quantity and the reason why stays off screen. `sm:hidden` rather than a JS
 * media query — same rule as §3.19, nothing is swapped on resize.
 */
export function LadderStickyHint({
  ladder,
  unitPriceCents,
  currency,
  locale,
}: {
  ladder: Ladder | null;
  unitPriceCents: number;
  currency: Currency;
  locale: "no" | "en";
}) {
  const t = useTranslations("configurator.ladder");
  const next = ladder?.next;
  if (!ladder || !next || next.minQty - ladder.qty > 2) return null;
  return (
    <p
      data-testid="ladder-sticky-hint"
      className="mb-2 rounded-full px-3 py-1.5 text-xs font-medium text-primary sm:hidden"
      style={{
        background: "color-mix(in oklab, var(--primary) 10%, var(--card))",
        border: "1px solid color-mix(in oklab, var(--primary) 30%, var(--border))",
      }}
    >
      {t("nudge", {
        missing: next.minQty - ladder.qty,
        amount: formatMoney(
          savedAt(unitPriceCents, currency, next.minQty, next.pct),
          locale
        ),
      })}
    </p>
  );
}
