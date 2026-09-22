"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DesignRound } from "@/components/ui-domain/design-round";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
 * R5-DESIGN-SWITCH — picker condiviso desktop + mobile (stesse card,
 * stesso gesto): riga `Design ▾ · covers N` sotto il canvas (mockup
 * `:149`) apre Dialog centrato su desktop, badge `{nome} ▾` sul canvas
 * (mockup `:275`) apre Sheet dal basso su mobile. Griglia compatta
 * 3 col con thumb veri `size-14` (mai placeholder), nome troncato una
 * riga + `{count} ceramics`. Scelta via `onSelect` (selectDesign del
 * caller): zero navigazione propria. Thumb = `DesignRound` sui
 * defaultLayers, zero nuovi asset.
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const pick = (d: DesignSwitchChoice) => {
    setDialogOpen(false);
    setSheetOpen(false);
    onSelect(d);
  };

  const card = (d: DesignSwitchChoice) => (
    <button
      type="button"
      onClick={() => pick(d)}
      aria-current={d.slug === current.slug ? "true" : undefined}
      className={cn(
        "w-full rounded-lg border p-2 text-center",
        d.slug === current.slug
          ? "border-primary bg-secondary"
          : "border-border bg-card"
      )}
    >
      <DesignRound layers={layersOf(d)} className="mx-auto size-14" />
      <b className="mt-1 block truncate text-xs font-medium">{nameOf(d)}</b>
      <span className="block text-[10px] text-muted-foreground">
        {t("coversShort", { count: productCounts[d.slug] ?? 0 })}
      </span>
    </button>
  );

  const layersOf = (d: DesignSwitchChoice) =>
    d.defaultLayers.map((l) => ({
      src: assetUrl(l.src),
      recolor: l.blend === "multiply",
    }));

  return (
    <>
      {/* Riga sotto il canvas: apre il picker (Dialog su desktop). */}
      <div className="mt-3 hidden md:block" data-testid="design-switch-row">
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          aria-haspopup="dialog"
          className="flex items-center gap-3"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("label")}
          </span>
          <span className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-card pl-1 pr-3 text-[13px] font-medium hover:border-ring">
            <DesignRound layers={layersOf(current)} className="size-8" />
            {nameOf(current)}{" "}
            <span aria-hidden className="text-muted-foreground">
              ▾
            </span>
          </span>
          <span className="text-[11.5px] text-muted-foreground">
            {t("covers", { count: productCounts[current.slug] ?? 0 })}
          </span>
        </button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          data-testid="design-switch-dialog"
          className="max-h-[80vh] max-w-[560px] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>{t("sheetTitle")}</DialogTitle>
            <p className="text-[11px] text-muted-foreground">
              {t("sheetSubtitle")}
            </p>
          </DialogHeader>
          <ul className="grid grid-cols-3 gap-2">
            {designs.map((d) => (
              <li key={d.slug}>{card(d)}</li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

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

      {/* Sheet mobile — stesse card del Dialog, in foglio dal basso. */}
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
          <ul className="grid grid-cols-3 gap-1.5 px-4 pb-6">
            {designs.map((d) => (
              <li key={d.slug} className="min-w-0">
                {card(d)}
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
