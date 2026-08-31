"use client";

import { useLocale, useTranslations } from "next-intl";
import { X } from "lucide-react";
import { formatMoney, money, multiply, percentOf, subtract } from "@/lib/money/money";
import { useCartContext } from "@/lib/cart/cart-context";
import { CartLineThumb } from "./cart-line-thumb";
import type { ActiveSuggestion } from "@/lib/discounts/discount";

/**
 * The offers block (DESIGN-SYSTEM §3.23, mockup variant A — artifact 4612669b).
 *
 * A LIST, not a card. Showing one offer at a time meant the second rule an admin
 * configured was reachable only by dismissing the first, so almost nobody saw
 * it: the admin page promised what the shop did not deliver. The engine returns
 * every eligible offer in the admin's own order, capped at MAX_SUGGESTIONS.
 *
 * Still a gentle block: never a popup, never an overlay, and ONE ✕ that closes
 * the whole thing. The ✕ no longer discards a single offer to reveal the next —
 * that is precisely the behaviour this replaced.
 *
 * Accepting an offer removes it and leaves the rest (D1: its product is now in
 * the cart), so the block shortens and disappears when the last one is taken.
 *
 * TODO:nb-review NO copy: cart.suggestion.kicker/add/dismiss/qtyName (TL wording)
 */
export function CartSuggestion() {
  const t = useTranslations("cart.suggestion");
  const td = useTranslations("cart.discount");
  const locale = useLocale() as "no" | "en";
  const { cart, suggestions, dismissSuggestions, acceptSuggestion } = useCartContext();

  if (suggestions.length === 0) return null;

  return (
    <div
      data-testid="cart-suggestion"
      className="relative my-3 rounded-sm border p-3"
      style={{
        backgroundColor: "color-mix(in oklab, var(--primary) 10%, var(--card))",
        borderColor: "color-mix(in oklab, var(--primary) 35%, var(--border))",
      }}
    >
      <button
        type="button"
        data-testid="cart-suggestion-dismiss"
        aria-label={t("dismiss")}
        onClick={dismissSuggestions}
        className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>

      <p className="mb-2 pr-11 text-[10px] font-semibold tracking-[.06em] text-primary uppercase">
        {t("kicker")}
      </p>

      <ul className="flex flex-col divide-y divide-border/60">
        {suggestions.map((s) => (
          <OfferRow
            key={s.rule.id}
            suggestion={s}
            locale={locale}
            addLabel={t("add")}
            nameLabel={(qty, name) => t("qtyName", { qty, name })}
            badgeLabel={(pct) => td("badge", { pct })}
            srNowLabel={td("srNowLabel")}
            fromLayers={cart.find((l) => l.id === s.fromLineId)}
            onAdd={() => acceptSuggestion(s)}
          />
        ))}
      </ul>
    </div>
  );
}

function OfferRow({
  suggestion,
  locale,
  addLabel,
  nameLabel,
  badgeLabel,
  srNowLabel,
  fromLayers,
  onAdd,
}: {
  suggestion: ActiveSuggestion;
  locale: "no" | "en";
  addLabel: string;
  nameLabel: (qty: number, name: string) => string;
  badgeLabel: (pct: number) => string;
  srNowLabel: string;
  fromLayers?: { layers?: { src: string; recolor?: boolean }[]; configSnapshot?: { selections: { hex: string | null }[] } | null };
  onAdd: () => void;
}) {
  const { rule, pct } = suggestion;
  const p = rule.suggested;
  if (!p) return null;

  const full = multiply(money(p.priceCents, p.currency), rule.suggestedQty);
  const saved = pct > 0 ? percentOf(full, pct) : money(0, p.currency);
  const net = subtract(full, saved);
  const hex = fromLayers?.configSnapshot?.selections.find((s) => s.hex)?.hex ?? undefined;
  const name = locale === "no" ? p.nameNo : p.nameEn;

  return (
    <li data-testid="cart-suggestion-row" className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
      {/* Both thumbnails, side by side (§3.23): the ceramic is what you buy,
          the design is what it wears. Stacked they made a 93px row. */}
      <CartLineThumb compact layers={fromLayers?.layers} hex={hex} plateImage={p.image ?? undefined} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {rule.suggestedQty > 1 ? nameLabel(rule.suggestedQty, name) : name}
        </p>
        {pct === 0 ? (
          <span data-testid="cart-suggestion-net" className="text-sm tabular-nums">
            {formatMoney(full, locale)}
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <s
              aria-hidden="true"
              data-testid="cart-suggestion-full"
              className="text-xs text-muted-foreground tabular-nums"
            >
              {formatMoney(full, locale)}
            </s>
            <span data-testid="cart-suggestion-net" className="text-sm font-medium tabular-nums">
              <span className="sr-only">{srNowLabel} </span>
              {formatMoney(net, locale)}
            </span>
            <span
              data-testid="cart-suggestion-badge"
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
              style={{
                backgroundColor: "color-mix(in oklab, var(--discount) 16%, white)",
                color: "color-mix(in oklab, var(--discount), black 34%)",
                border: "1px solid color-mix(in oklab, var(--discount) 38%, white)",
              }}
            >
              {badgeLabel(pct)}
            </span>
          </span>
        )}
      </div>
      {/* A LINK, not a pill (§3.23): three filled violet pills in a column would
          compete with «Bestill», which must stay the only filled button on the
          page. The padding keeps the touch target ≥44px. */}
      <button
        type="button"
        data-testid="cart-suggestion-add"
        onClick={onAdd}
        className="-my-2 shrink-0 self-center px-2 py-3 text-sm font-medium text-primary underline underline-offset-2 hover:text-foreground"
      >
        {addLabel}
      </button>
    </li>
  );
}
