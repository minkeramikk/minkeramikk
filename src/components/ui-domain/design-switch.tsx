"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DesignRound } from "@/components/ui-domain/design-round";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { assetUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import type { PreviewLayer } from "@/lib/configurator/preview";

/** Scelta design minima servita dallo switch (ui-domain → lib, mai route). */
export interface DesignSwitchChoice {
  id: string;
  slug: string;
  /** Legacy single-language name (fallback). */
  name: string;
  nameNo: string;
  nameEn: string;
  defaultLayers: PreviewLayer[];
}

/**
 * R5-DESIGN-SWITCH T1 + follow-up 22/9 (card §Piano agganciato B) —
 * design switch allo step 2. Riga desktop orizzontale scrollabile
 * (artifact `DesignSwitch()` di r5-animation: pill con tondo + nome,
 * attiva evidenziata) + badge mobile («{nome} ▾» sul canvas → Sheet
 * griglia 3 col con thumb veri, artifact `DesignSheet()`). La scelta
 * naviga via `onSelect` (il `selectDesign` fixato del caller): zero
 * navigazione propria. Thumb = `DesignRound` sui defaultLayers (stessa
 * tecnica di step 1, zero nuovi asset).
 */
export function DesignSwitch({
  designs,
  currentSlug,
  productCounts = {},
  onSelect,
}: {
  designs: DesignSwitchChoice[];
  currentSlug: string;
  /** slug → n. ceramiche whitelistate (server, `getDesignProducts`). */
  productCounts?: Record<string, number>;
  onSelect: (d: DesignSwitchChoice) => void;
}) {
  // TODO:nb-review — configurator.designSwitch.* NO copy is new, unreviewed.
  const t = useTranslations("configurator.designSwitch");
  const locale = useLocale();
  const nameOf = (d: DesignSwitchChoice) =>
    (locale === "no" ? d.nameNo : d.nameEn) || d.nameNo || d.name;
  const current: DesignSwitchChoice =
    designs.find((d) => d.slug === currentSlug) ?? designs[0];
  const [sheetOpen, setSheetOpen] = useState(false);

  const pick = (d: DesignSwitchChoice) => {
    setSheetOpen(false);
    onSelect(d);
  };

  const layersOf = (d: DesignSwitchChoice) =>
    d.defaultLayers.map((l) => ({
      src: assetUrl(l.src),
      recolor: l.blend === "multiply",
    }));

  return (
    <>
      {/* Desktop — riga orizzontale scrollabile (artifact `DesignSwitch()`):
          pill per design con tondo + nome, attiva evidenziata. `covers N`
          resta fuori dalla lista, a destra. */}
      <div
        data-testid="design-switch-row"
        data-scroll
        className="mt-3 hidden items-center gap-1.5 overflow-x-auto md:flex"
      >
        <span className="mr-1 flex-none text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {t("label")}
        </span>
        {designs.map((d) => (
          <button
            key={d.slug}
            type="button"
            onClick={() => pick(d)}
            aria-pressed={d.slug === current.slug}
            className={cn(
              "flex min-h-9 flex-none items-center gap-1.5 rounded-full border-[1.5px] py-0.5 pl-0.5 pr-3 text-[12.5px]",
              d.slug === current.slug
                ? "border-primary bg-secondary font-semibold text-primary"
                : "border-border bg-card text-muted-foreground hover:border-ring"
            )}
          >
            <DesignRound layers={layersOf(d)} className="size-7" />
            {nameOf(d)}
          </button>
        ))}
        <span className="ml-1 flex-none text-[11.5px] text-muted-foreground">
          {t("covers", { count: productCounts[current.slug] ?? 0 })}
        </span>
      </div>

      {/* Mobile `:275` — badge sul canvas, apre lo Sheet. */}
      <button
        type="button"
        data-testid="design-switch-badge"
        onClick={() => setSheetOpen(true)}
        aria-haspopup="dialog"
        className="absolute right-3 top-2.5 flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold md:hidden"
      >
        {nameOf(current)}{" "}
        <span aria-hidden className="text-muted-foreground">
          ▾
        </span>
      </button>

      {/* Sheet mobile — griglia 3 col con thumb veri (artifact
          `DesignSheet()`): card con tondo `size-16` da `layersOf()` (mai
          placeholder), nome + `{count} ceramics`. Niente link
          `all designs →`: nessuna rotta, meglio assente che morto. */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          data-testid="design-switch-sheet"
          className="max-h-[70svh] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{t("sheetTitle")}</SheetTitle>
            <p className="text-[11px] text-muted-foreground">
              {t("sheetSubtitle")}
            </p>
          </SheetHeader>
          <ul className="grid grid-cols-3 gap-2 px-4 pb-6">
            {designs.map((d) => (
              <li key={d.slug}>
                <button
                  type="button"
                  onClick={() => pick(d)}
                  aria-current={d.slug === current.slug ? "true" : undefined}
                  className={cn(
                    "rounded-lg border p-2.5 text-center",
                    d.slug === current.slug
                      ? "border-primary bg-secondary"
                      : "border-border bg-card"
                  )}
                >
                  <DesignRound
                    layers={layersOf(d)}
                    className="mx-auto size-16"
                  />
                  <b className="mt-1.5 block text-xs font-medium">
                    {nameOf(d)}
                  </b>
                  <span className="block text-[10px] text-muted-foreground">
                    {t("coversShort", {
                      count: productCounts[d.slug] ?? 0,
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
