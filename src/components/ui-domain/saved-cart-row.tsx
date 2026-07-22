"use client";

import { useLocale, useTranslations } from "next-intl";
import { DesignRound } from "@/components/ui-domain/design-round";
import { designLabel } from "@/lib/cart/cart";
import { savedPieces, type SavedCart } from "@/lib/cart/saved-cart";

/**
 * F40 — la riga del carrello salvato, in cima al drawer sopra le righe
 * correnti (mockup pannello 1). Superficie tenue + bordo tratteggiato: è
 * "messo da parte", non parte dell'ordine in corso. Slot vuoto → il chiamante
 * non rende niente (nessuna riga fantasma, nessun badge nuovo in header).
 *
 * La riga è disegnata per poter diventare N righe (lista di salvataggi), ma la
 * v1 ha uno slot unico: nessuna astrazione anticipata.
 */
export function SavedCartRow({
  saved,
  onRestore,
  pending = false,
}: {
  saved: SavedCart;
  onRestore: () => void;
  pending?: boolean;
}) {
  const t = useTranslations("cart");
  const locale = useLocale() as "no" | "en";

  const first = saved.lines[0];
  const designs = new Set(saved.lines.map((l) => l.configSnapshot?.designSlug)).size;
  const name = designLabel(first?.configSnapshot, locale) ?? "—";
  const label = designs > 1 ? `${name} +${designs - 1}` : name;
  // Guard: `saved.savedAt` is accepted by parseSavedCart as any string; a
  // non-ISO value yields an Invalid Date, and Intl.DateTimeFormat.format()
  // THROWS RangeError on that — would crash the whole drawer. Render no date
  // rather than risk it; title + design name alone still identify the row.
  const parsedDate = saved.savedAt ? new Date(saved.savedAt) : null;
  const date =
    parsedDate && !Number.isNaN(parsedDate.getTime())
      ? new Intl.DateTimeFormat(locale === "no" ? "nb-NO" : "en-GB", {
          day: "numeric",
          month: "long",
        }).format(parsedDate)
      : "";

  return (
    <div
      data-testid="saved-cart-row"
      className="rounded-sm border border-dashed border-primary/40 bg-primary/5 p-3"
    >
      <div className="flex items-center gap-3">
        <DesignRound layers={first?.layers ?? []} className="size-11" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {t("saved.rowTitle", { count: savedPieces(saved) })}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {label}
            {date && ` · ${date}`}
          </p>
        </div>
        <button
          type="button"
          data-testid="saved-cart-restore"
          onClick={onRestore}
          disabled={pending}
          className="flex min-h-11 shrink-0 items-center text-xs font-semibold text-primary hover:underline disabled:opacity-60"
        >
          {t("saved.restore")} ›
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{t("saved.device")}</p>
    </div>
  );
}
