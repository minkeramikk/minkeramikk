"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { formatMoney, money, multiply, percentOf, subtract } from "@/lib/money/money";
import type { SheetOffer } from "@/lib/discounts/sheet-offer";
import { cn } from "@/lib/utils";

/**
 * R4-UPSELL-MODALE / R4-SCONTI-2 §D (DESIGN-SYSTEM §3.24) — the offers in the
 * product sheet, above the buy row.
 *
 * Presentational only: everything it needs is a prop, nothing is read from
 * context, so it can be reasoned about (and screenshotted) on its own. An empty
 * list renders nothing at all — the band does not exist.
 *
 * ONE compact list, not a card per offer (Alessio, 1/9): row = thumb + name and
 * price + a small button on the right. Three offers must fit in one box without
 * turning it into a flyer.
 *
 * ONE row renderer for BOTH states, on purpose: while locked and unlocked were
 * two separate returns sharing nothing, the locked one drifted into a bare
 * «add 3 more to unlock» that never named what was being unlocked. A locked row
 * now draws the same thumb, name, struck price, discounted price and −% badge —
 * an offer you can see is an incentive, one you discover afterwards is a refund.
 *
 * Three deliberate differences, and no others:
 *  - the button raises the QUANTITY (`onSetQty`), it does not add to the
 *    basket. Same rule as the ladder's rungs: choosing how many and adding are
 *    two different jobs;
 *  - the line under the price is the THRESHOLD («At 6 in total»), not
 *    whatBoth/whatOnly — that copy describes an add the locked button won't do;
 *  - the band stays muted instead of primary, so locked and unlocked stay
 *    distinguishable at a glance.
 *
 * Two things the rows must keep saying:
 *  - §D.1 — the button DECLARES what it adds. «Legg til 8+4» is eight plates
 *    plus the four on offer; when the basket alone already fires the rule it
 *    becomes «Legg til 4». The numbers come from the engine (`baseQty`), never
 *    from arithmetic done here.
 *  - §D.2 — a taken offer STAYS in the list, marked and no longer pressable.
 *    The sheet does not close, so the customer can take the others too.
 *
 * TODO:nb-review NO copy: cart.sheetOffer.*
 */
export function SheetOfferBlock({
  offers,
  currentName,
  locale,
  takenRuleIds,
  onSetQty,
  onTake,
}: {
  offers: SheetOffer[];
  /** The product the sheet is open on — what «adds N …» names. Never the design. */
  currentName: string;
  locale: "no" | "en";
  /** Rules already taken in this sheet session: marked, not pressable. */
  takenRuleIds: string[];
  onSetQty: (next: number) => void;
  onTake: (offer: Extract<SheetOffer, { kind: "unlocked" }>) => void;
}) {
  const t = useTranslations("cart.sheetOffer");
  const tSuggestion = useTranslations("cart.suggestion");
  const tDiscount = useTranslations("cart.discount");

  if (offers.length === 0) return null;

  // The two states never mix (sheet-offer.ts): one unlocked offer and the whole
  // band is unlocked. So the band's colour is the first row's kind.
  const bandLocked = offers[0].kind === "locked";
  const tint = bandLocked
    ? { base: "var(--muted)", fill: 45, edge: 30, rule: 40 }
    : { base: "var(--primary)", fill: 10, edge: 35, rule: 18 };

  function row(offer: SheetOffer) {
    const { suggestion, selfOffer } = offer;
    const p = suggestion.rule.suggested;
    // Guaranteed by sheet-offer.ts, which drops an undrawable row; the
    // narrowing is for the type, not for a case that can happen.
    if (!p) return null;

    const locked = offer.kind === "locked";
    const extraQty = suggestion.rule.suggestedQty;
    const full = multiply(money(p.priceCents, p.currency), extraQty);
    const net = subtract(full, percentOf(full, suggestion.pct));
    const suggestedName = locale === "no" ? p.nameNo : p.nameEn;
    const taken = !locked && takenRuleIds.includes(suggestion.rule.id);

    return (
      <li
        key={suggestion.rule.id}
        data-testid={locked ? "sheet-offer-locked" : "sheet-offer-row"}
        className={cn("flex items-center gap-2.5", "[&+&]:mt-2.5 [&+&]:border-t [&+&]:pt-2.5")}
        style={{
          borderTopColor: `color-mix(in oklab, ${tint.base} ${tint.rule}%, var(--border))`,
        }}
      >
        {p.image ? (
          /* eslint-disable-next-line @next/next/no-img-element -- catalog art from storage */
          <img
            src={p.image}
            alt=""
            aria-hidden
            loading="lazy"
            className="size-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span aria-hidden className="size-9 shrink-0 rounded-full bg-muted" />
        )}

        <span className="min-w-0 flex-1">
          <b
            className={cn(
              "block truncate text-[13px] font-semibold",
              taken && "text-muted-foreground"
            )}
          >
            {selfOffer
              ? t("self", { qty: extraQty, pct: suggestion.pct })
              : tSuggestion("qtyName", { qty: extraQty, name: suggestedName })}
          </b>
          <span className="text-xs tabular-nums">
            <s aria-hidden="true" className="mr-1.5 text-muted-foreground">
              {formatMoney(full, locale)}
            </s>
            <span className="sr-only">{tDiscount("srNowLabel")} </span>
            {formatMoney(net, locale)}{" "}
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
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {offer.kind === "locked"
              ? t("atTotal", { qty: offer.neededQty })
              : taken
                ? t("taken")
                : offer.baseQty > 0
                  ? t("whatBoth", {
                      base: offer.baseQty,
                      name: currentName,
                      extra: extraQty,
                      extraName: suggestedName,
                    })
                  : t("whatOnly", {
                      extra: extraQty,
                      extraName: suggestedName,
                      name: currentName,
                    })}
          </span>
        </span>

        {offer.kind === "locked" ? (
          <Button
            data-testid="sheet-offer-unlock"
            onClick={() => onSetQty(offer.neededQty)}
            className="min-h-9 shrink-0 rounded-full px-3.5 text-[12.5px] tabular-nums"
          >
            {t("addMissing", { missing: offer.missing })}
          </Button>
        ) : taken ? (
          <span
            data-testid="sheet-offer-taken"
            aria-hidden
            className="grid min-h-9 min-w-11 shrink-0 place-items-center rounded-full text-sm font-semibold"
            style={{
              backgroundColor: "color-mix(in oklab, var(--discount) 18%, white)",
              color: "color-mix(in oklab, var(--discount), black 36%)",
              border: "1px solid color-mix(in oklab, var(--discount) 40%, white)",
            }}
          >
            ✓
          </span>
        ) : (
          <Button
            data-testid="sheet-offer-add"
            onClick={() => onTake(offer)}
            className="min-h-9 shrink-0 rounded-full px-3.5 text-[12.5px] tabular-nums"
          >
            {offer.baseQty > 0
              ? t("addBase", { base: offer.baseQty, extra: extraQty })
              : t("addOnly", { extra: extraQty })}
          </Button>
        )}
      </li>
    );
  }

  return (
    <div
      data-testid="sheet-offer"
      className="rounded-sm border p-3"
      style={{
        backgroundColor: `color-mix(in oklab, ${tint.base} ${tint.fill}%, var(--card))`,
        borderColor: `color-mix(in oklab, ${tint.base} ${tint.edge}%, var(--border))`,
      }}
    >
      <p
        className={cn(
          "mb-2 text-[10px] font-semibold tracking-[.06em] uppercase",
          bandLocked ? "text-muted-foreground" : "text-primary"
        )}
      >
        {bandLocked ? t("kicker") : t("kickerUnlocked")}
      </p>

      <ul className="flex flex-col">{offers.map(row)}</ul>
    </div>
  );
}
