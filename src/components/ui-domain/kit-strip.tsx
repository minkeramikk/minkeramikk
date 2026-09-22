"use client";

import { useTranslations } from "next-intl";
import { cartPieces, unpaintedPieces, type Cart } from "@/lib/cart/cart";

/**
 * R5-KIT — the strip above the step nav on a kit landing: what the kit is,
 * how many pieces, how many already painted. Pure props, no cart read inside
 * (steps 2 and 3 both supply the same two numbers).
 */
export function KitStrip({
  thumb,
  total,
  painted,
}: {
  thumb: React.ReactNode;
  total: number;
  painted: number;
}) {
  const t = useTranslations("kit.strip");
  return (
    <div
      data-testid="kit-strip"
      className="flex items-center gap-2.5 border-b border-border bg-secondary px-4 py-2 text-[12px]"
    >
      {thumb}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{t("title")}</span>
        <span className="block truncate text-muted-foreground">
          {t("subtitle", { count: total })}
        </span>
      </span>
      <span className="rounded-full bg-card px-2 py-1 text-[11px] ring-1 ring-border">
        {t("painted", { painted, total })}
      </span>
    </div>
  );
}

/** The two numbers both kit landings feed `KitStrip` with. */
export function kitStripCounts(cart: Cart): { total: number; painted: number } {
  const total = cartPieces(cart);
  return { total, painted: total - unpaintedPieces(cart) };
}
