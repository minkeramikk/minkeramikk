"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Brush, CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";
import { DesignRound } from "@/components/ui-domain/design-round";
import { Dots } from "@/components/ui-domain/cart-line-row";
import { PaletteDedicationLine } from "./palette-chip";
import { MAX_PALETTES } from "@/lib/palettes/palettes";
import { capLane, nowSecondLine, SWITCH_CAP } from "./palette-card-model";
import type { CartLayer } from "@/lib/cart/cart";
import type { TextPosition } from "@/lib/configurator/text-position";

/**
 * R5-NEW-PALETTE — DS §3.31: `now` presente = interruttore (step 3),
 * assente = libreria (step 2). Presentational: nessun accesso allo store;
 * l'unico stato è `showAll`.
 */
interface NowData {
  layers: CartLayer[];
  name: string;
  dedication?: string;
  textPosition?: TextPosition;
  designName: string;
  hexes: string[];
}

interface PaletteCardProps {
  /** Un PaletteChip per palette da mostrare (array: la card conta). */
  chips: ReactNode[];
  /** Slot a destra: Save (step 2) / Edit colours (step 3). */
  actions: ReactNode;
  /** palettes.length → «n of 10 saved». */
  saved: number;
  /** Presente = step 3 (interruttore); assente = step 2 (libreria). */
  now?: NowData;
}

/**
 * R5-TUTORIAL round 3 (plan Task D) — the "?" that replaces both the old
 * standalone save-as-palette hint and passo 2's own tip that used to sit on
 * this same card (both are gone from the guided tour now): click-for-help,
 * own local `open` state, no localStorage, no tour state at all. Two call
 * sites, two copies — `now` (step 3's switch header) explains "this is what
 * you're painting with"; the library header (step 2, no `now`) explains how
 * palettes work in general.
 *
 * Never collides with the tour's own `Hotspot`: that badge sits on the
 * card's outer wrapper (top-right corner) and opens ABOVE it; this button
 * lives in the header row and opens BELOW it.
 *
 * Exported: `PaletteSheet` (palette-sheet.tsx) is a separate implementation
 * of the same "current palette" concept for phones, not a wrapper around
 * this card — its header had no "?" at all until this fix wave. Reusing
 * this component (not duplicating its markup) keeps the popover's styling/
 * behaviour byte-for-byte identical between the two surfaces.
 */
export function PaletteHelp({
  mode,
  saved,
  touchTarget = false,
}: {
  mode: "now" | "manage";
  saved: number;
  /** Reviewer (PR #76): `PaletteSheet` is a touch-only surface where every
   *  other control is 44px (DS §5) — this button didn't scale up when it
   *  moved there from `PaletteCard`'s desktop-only 24px. `true` there,
   *  default `false` keeps `PaletteCard`'s existing desktop size. */
  touchTarget?: boolean;
}) {
  const t = useTranslations("palettes.card");
  const [open, setOpen] = useState(false);
  return (
    // ponytail: popover only, sheet if 390 clips it — the card is
    // full-width there already, so the bubble has the room it needs.
    <span
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("help")}
        aria-expanded={open}
        data-testid="palette-help"
        className={cn(
          "grid shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary",
          touchTarget ? "size-11" : "size-6"
        )}
      >
        <CircleHelp className={touchTarget ? "size-5" : "size-4"} aria-hidden />
      </button>
      {open && (
        <span className="absolute left-0 top-full mt-2 z-30 flex w-max max-w-[268px] items-start gap-1.5 rounded-lg border border-primary/30 bg-popover px-2.5 py-2 text-left text-[12px] leading-snug shadow-lg">
          <span className="min-w-0 flex-1">
            {mode === "now"
              ? t.rich("helpNow", { b: (chunks) => <b>{chunks}</b>, saved })
              : t.rich("helpManage", { b: (chunks) => <b>{chunks}</b>, max: MAX_PALETTES })}
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("helpClose")}
            className="shrink-0 text-muted-foreground"
          >
            ✕
          </button>
        </span>
      )}
    </span>
  );
}

export function PaletteCard({ chips, actions, saved, now }: PaletteCardProps) {
  // TODO:nb-review su tutte le chiavi NO di palettes.card, incluse le 4 del
  // popover "?" (round 3, Task D) — copy nuova, nessuna fonte live-site.
  const t = useTranslations("palettes.card");
  const tBar = useTranslations("palettes.bar");
  const [showAll, setShowAll] = useState(false);
  const { visible, hidden } = now ? capLane(chips, showAll) : { visible: chips, hidden: 0 };
  const count = (
    <span className="text-[10px] text-muted-foreground">
      {tBar("manageCount", { count: saved, max: MAX_PALETTES })}
    </span>
  );
  const slot = <span className="ml-auto flex shrink-0 items-center gap-2">{actions}</span>;

  return (
    <div
      data-testid="palette-card"
      className="rounded-lg border border-primary/20 bg-[var(--mk-canvas)] p-3.5"
    >
      {now &&
        (() => {
          const line = nowSecondLine(now.dedication, now.designName, now.textPosition);
          return (
            <div
              data-testid="palette-card-now"
              className="flex items-center gap-3 rounded-[13px] bg-secondary px-3 py-2.5 ring-1 ring-primary/20"
            >
              <DesignRound layers={now.layers} className="size-12" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-primary">
                  <Brush aria-hidden className="size-[11px]" strokeWidth={2.4} />
                  {t("paintingNow")}
                </p>
                <p className="truncate text-[16px] font-semibold leading-tight text-foreground">
                  {now.name}
                </p>
                {line.kind === "dedication" ? (
                  // Live "now" state (not a saved snapshot): no forced
                  // "centre" — nothing shows until one is actually chosen.
                  <PaletteDedicationLine
                    text={line.text}
                    position={line.position}
                    className="max-w-none text-[10.5px]"
                  />
                ) : (
                  <p className="truncate text-[10.5px] text-muted-foreground">{line.text}</p>
                )}
              </div>
              <Dots hexes={now.hexes} />
            </div>
          );
        })()}

      {now ? (
        visible.length === 0 ? (
          <div
            data-testid="palette-card-switch"
            data-empty
            role="group"
            aria-label={t("switchTo")}
            className="mt-3 flex items-center gap-2.5 rounded-[11px] border border-dashed border-border px-3 py-2.5"
          >
            <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted-foreground">
              {t("emptyHint")}
            </p>
            {actions}
          </div>
        ) : (
          <div
            data-testid="palette-card-switch"
            role="group"
            aria-label={t("switchTo")}
            className="mt-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {t("switchTo")}
              </span>
              {count}
              <PaletteHelp mode="now" saved={saved} />
              {slot}
            </div>
            <div className="flex flex-wrap gap-2">{visible}</div>
            {(hidden > 0 || (showAll && chips.length > SWITCH_CAP)) && (
              <button
                type="button"
                data-testid="palette-card-showall"
                onClick={() => setShowAll((v) => !v)}
                className="mt-2 text-[11.5px] font-medium text-primary underline underline-offset-2"
              >
                {showAll ? t("showFewer") : t("showAll", { count: chips.length })}
              </button>
            )}
          </div>
        )
      ) : visible.length === 0 ? (
        // R5-PALETTE-PLACE — zero saved palettes + no choice yet: a hint,
        // never an absent card and never the header (nothing to manage or
        // help-explain yet). The caller already keeps this in step with
        // "no choice yet" (the draft chip only reaches `chips` once the
        // customer picks something) — this only covers the zero-saved case
        // on top of that.
        <div
          data-testid="palette-card-empty"
          className="flex items-center gap-2.5 rounded-[11px] border border-dashed border-border px-3 py-2.5"
        >
          {/* TODO:nb-review — palettes.card.libraryEmptyHint, new copy */}
          <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted-foreground">
            {t("libraryEmptyHint")}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary">
              {tBar("eyebrowManage")}
            </span>
            {count}
            <PaletteHelp mode="manage" saved={saved} />
            {slot}
          </div>
          <div className="flex flex-wrap gap-2">{visible}</div>
        </>
      )}
    </div>
  );
}
