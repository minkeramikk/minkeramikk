"use client";

import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney, money, multiply, percentOf, subtract } from "@/lib/money/money";
import { useCartContext } from "@/lib/cart/cart-context";
import { CartLineThumb } from "./cart-line-thumb";

/**
 * DESIGN-SYSTEM §3.23 — the gentle upsell card, shared by CartDrawer (§3.12)
 * and DockedCart (§3.14): one suggestion at a time, dismissible, never a
 * popup/overlay. Reads `suggestion`/`acceptSuggestion` straight off the cart
 * context (Task 13); renders nothing when there is none to show.
 *
 * The price cell mirrors CartLinePrice's markup (§3.22) rather than reusing
 * the component directly — this card needs its own `cart-suggestion-*`
 * testids, distinct from a cart line's `cart-line-*`.
 *
 * The thumbnail shows the TRIGGERING line's pattern (`layers`/`hex`) under
 * the suggested product's own plate photo — exactly the composite
 * `acceptSuggestion` is about to add, not a blank pattern cell (the
 * suggested product has no layers of its own; `CartLineThumb` always
 * renders that cell, so passing nothing left a permanently empty box).
 */
export function CartSuggestion() {
  const t = useTranslations("cart.suggestion");
  const td = useTranslations("cart.discount");
  const locale = useLocale() as "no" | "en";
  const { suggestion, acceptSuggestion, dismissRule, cart } = useCartContext();

  if (!suggestion) return null;
  const { rule, pct } = suggestion;
  const p = rule.suggested;
  if (!p) return null;
  const from = cart.find((l) => l.id === suggestion.fromLineId);
  const fromHex = from?.configSnapshot?.selections.find((s) => s.hex)?.hex ?? undefined;

  const full = multiply(money(p.priceCents, p.currency), rule.suggestedQty);
  const saved = pct > 0 ? percentOf(full, pct) : money(0, p.currency);
  const net = subtract(full, saved);

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
        onClick={() => dismissRule(rule.id)}
        className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>

      {/* TODO:nb-review NO copy: cart.suggestion.kicker/add/dismiss (TL wording) */}
      <p className="mb-2 pr-11 text-[10px] font-semibold tracking-[.06em] text-primary uppercase">
        {t("kicker")}
      </p>

      <div className="flex items-center gap-3">
        <CartLineThumb
          layers={from?.layers}
          hex={fromHex}
          plateImage={p.image ?? undefined}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {locale === "no" ? p.nameNo : p.nameEn}
          </p>
          {pct === 0 ? (
            <span data-testid="cart-suggestion-net" className="text-sm font-medium tabular-nums">
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
                <span className="sr-only">{td("srNowLabel")} </span>
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
                {td("badge", { pct })}
              </span>
            </span>
          )}
        </div>
        <button
          type="button"
          data-testid="cart-suggestion-add"
          onClick={acceptSuggestion}
          className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground min-h-11"
        >
          {t("add")}
        </button>
      </div>
    </div>
  );
}
