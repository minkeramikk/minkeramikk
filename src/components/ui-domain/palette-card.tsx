"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Brush } from "lucide-react";
import { DesignRound } from "@/components/ui-domain/design-round";
import { Dots } from "@/components/ui-domain/cart-line-row";
import { PaletteDedicationLine } from "./palette-chip";
import { MAX_PALETTES } from "@/lib/palettes/palettes";
import { capLane, nowSecondLine, SWITCH_CAP } from "./palette-card-model";
import type { CartLayer } from "@/lib/cart/cart";

/**
 * R5-NEW-PALETTE — DS §3.31: `now` presente = interruttore (step 3),
 * assente = libreria (step 2). Presentational: nessun accesso allo store;
 * l'unico stato è `showAll`.
 */
interface NowData {
  layers: CartLayer[];
  name: string;
  dedication?: string;
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

export function PaletteCard({ chips, actions, saved, now }: PaletteCardProps) {
  // TODO:nb-review sulle 6 chiavi NO di palettes.card (copy nuova, nessuna fonte live-site).
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
          const line = nowSecondLine(now.dedication, now.designName);
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
                  <PaletteDedicationLine text={line.text} className="max-w-none text-[10.5px]" />
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
            className="mt-3 flex items-center gap-2.5 rounded-[11px] border border-dashed border-border px-3 py-2.5"
          >
            <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted-foreground">
              {t("emptyHint")}
            </p>
            {actions}
          </div>
        ) : (
          <div data-testid="palette-card-switch" className="mt-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {t("switchTo")}
              </span>
              {count}
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
      ) : (
        <>
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary">
              {tBar("eyebrowManage")}
            </span>
            {count}
            {slot}
          </div>
          <div className="flex flex-wrap gap-2">{visible}</div>
        </>
      )}
    </div>
  );
}
