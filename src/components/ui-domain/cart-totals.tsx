"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@/lib/money/money";
import { useCartContext } from "@/lib/cart/cart-context";
import { CartShippingRow, useShippingTotalSuffix } from "./cart-shipping-row";

/**
 * R4-SCONTI (DESIGN-SYSTEM §3.22) — the totals block of both cart surfaces,
 * including the shipping row (§3.15), which reads the NET total (D5).
 * When nothing is discounted this renders exactly the two rows it rendered
 * before the card: shipping + total.
 *
 * `totalTestId` lets the step-3 docked panel keep its own `docked-total`
 * testid (e2e/cart.spec.ts, e2e/order.spec.ts) while the drawer keeps
 * `cart-total`.
 */
export function CartTotals({
  totalTestId = "cart-total",
}: {
  totalTestId?: string;
}) {
  const t = useTranslations("cart");
  const td = useTranslations("cart.discount");
  const locale = useLocale() as "no" | "en";
  const { discount } = useCartContext();
  const suffix = useShippingTotalSuffix(discount.total);
  const discounted =
    discount.tierSaved.amountCents > 0 || discount.dealSaved.amountCents > 0;

  return (
    <div className="flex flex-col gap-2">
      {discounted && (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{td("subtotal")}</span>
            <span data-testid="cart-subtotal" className="tabular-nums">
              {formatMoney(discount.subtotal, locale)}
            </span>
          </div>
          {discount.tierSaved.amountCents > 0 && (
            <div
              className="flex items-center justify-between text-sm font-medium"
              style={{ color: "color-mix(in oklab, var(--discount), black 34%)" }}
            >
              <span>{td("quantityRow")}</span>
              <span data-testid="cart-discount-total" className="tabular-nums">
                −{formatMoney(discount.tierSaved, locale)}
              </span>
            </div>
          )}
          {discount.dealSaved.amountCents > 0 && (
            <div
              className="flex items-center justify-between text-sm font-medium"
              style={{ color: "color-mix(in oklab, var(--discount), black 34%)" }}
            >
              <span>{td("dealRow")}</span>
              <span data-testid="cart-deal-total" className="tabular-nums">
                −{formatMoney(discount.dealSaved, locale)}
              </span>
            </div>
          )}
        </>
      )}

      <CartShippingRow total={discount.total} />

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t("total")}</span>
        <span data-testid={totalTestId} className="text-lg font-semibold tabular-nums">
          {formatMoney(discount.total, locale)}
          {suffix}
        </span>
      </div>

      {discounted && (
        <p data-testid="cart-discount-note" className="text-center text-[10px] text-muted-foreground">
          {td("note")}
        </p>
      )}
    </div>
  );
}
