"use client";

import { useTranslations } from "next-intl";
import { cartPieces, unpaintedPieces, type Cart } from "@/lib/cart/cart";

/**
 * R5-KIT — the strip above the step nav on a kit landing: what the kit is,
 * how many pieces, how many already painted. Pure props, no cart read inside
 * (steps 2 and 3 both supply the same two numbers). `title`: the featured
 * label of the kit when the landing matched one (custom label, else design
 * name — same fallback as the strip card), else the generic fallback.
 */
export function KitStrip({
  thumb,
  title,
  total,
  painted,
}: {
  thumb: React.ReactNode;
  /** null → generic "A kit from minkeramikk" fallback */
  title: string | null;
  total: number;
  painted: number;
}) {
  const t = useTranslations("kit.strip");
  return (
    <div
      data-testid="kit-strip"
      className="flex items-center gap-2.5 rounded-lg border border-border bg-secondary px-4 py-2 text-[12px]"
    >
      {thumb}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title ?? t("title")}</span>
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

/**
 * The kit label rides step 2 → step 3 in the URL (`kitlabel=`), because step 3
 * is a separate server render that never sees the resolver. Base64 of
 * "no\nen" — labels are admin copy, short, and never contain a newline.
 */
export function encodeKitLabel(label: { no: string; en: string }): string {
  return btoa(unescape(encodeURIComponent(`${label.no}\n${label.en}`)));
}

/** Inverse of `encodeKitLabel`; null on anything malformed. */
export function decodeKitLabel(raw: string | null | undefined): {
  no: string;
  en: string;
} | null {
  if (!raw) return null;
  try {
    const [no, en] = decodeURIComponent(escape(atob(raw))).split("\n");
    return no && en ? { no, en } : null;
  } catch {
    return null;
  }
}
