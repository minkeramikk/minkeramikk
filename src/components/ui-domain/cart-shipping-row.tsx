"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatMoney, type Money } from "@/lib/money/money";
import { freeShippingThreshold, shippingStatus } from "@/lib/cart/shipping";
import { LegalSheet } from "@/components/ui-domain/legal-sheet";

/**
 * Insured shipping row (R3-B4/R5-GARANZIA, DESIGN-SYSTEM §3.12/§3.14). Shared
 * by the cart drawer and the docked step-3 panel: at or above the threshold
 * shipping is included and we show the compact insurance policy ("Les mer" →
 * Terms, which carries the full text from the same i18n namespace); below it
 * we show the flat fee (200 kr) plus the exact amount missing to clear the
 * threshold — the send is never blocked.
 *
 * TODO:alessio-review — the `cart.insurance.*` copy (NO/EN) is the TL's
 * provisional wording: swap the keys when Alessio delivers the final policy.
 */
export function CartShippingRow({ net, shipping }: { net: Money; shipping: Money }) {
  const t = useTranslations("cart.insurance");
  const locale = useLocale() as "no" | "en";
  const status = shippingStatus(net);

  return (
    <div className="flex flex-col gap-1" data-testid="cart-shipping">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{t("title")}</span>
        <span
          data-testid="cart-shipping-status"
          className={
            status.included ? "font-medium text-foreground" : "text-muted-foreground"
          }
        >
          {status.included ? t("included") : formatMoney(shipping, locale)}
        </span>
      </div>

      {status.included ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("policyShort")}{" "}
          <LegalSheet doc="terms">
            <button
              type="button"
              data-testid="cart-shipping-readmore"
              aria-haspopup="dialog"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {t("readMore")}
            </button>
          </LegalSheet>
        </p>
      ) : (
        <p
          data-testid="cart-shipping-nudge"
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {t("nudge", {
            threshold: formatMoney(freeShippingThreshold, locale),
            amount: formatMoney(status.missing, locale),
          })}
        </p>
      )}
    </div>
  );
}
