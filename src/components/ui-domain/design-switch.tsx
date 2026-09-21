"use client";

import { useEffect, useRef, useState } from "react";
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
 * R5-DESIGN-SWITCH T1 — design switch allo step 2 (mockup-palettebar.html).
 * Riga desktop `:149` («Design ▾ · covers N ceramics», inline listbox) +
 * badge mobile `:275` («{nome} ▾» sul canvas → Sheet solo nomi). La scelta
 * naviga via `onSelect` (il `selectDesign` fixato del caller): zero
 * navigazione propria. Thumb = `DesignRound` sui defaultLayers (stessa
 * tecnica di step 1, zero nuovi asset) — solo riga/listbox desktop; la
 * Sheet mobile è solo nomi da spec.
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
  const [listOpen, setListOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Listbox inline: chiusura Escape + click fuori.
  useEffect(() => {
    if (!listOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setListOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node))
        setListOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [listOpen]);

  const pick = (d: DesignSwitchChoice) => {
    setListOpen(false);
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
      {/* Desktop `:149` — riga sotto il canvas, lista inline. */}
      <div
        data-testid="design-switch-row"
        className="mt-3 hidden items-center gap-3 md:flex"
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("label")}
        </span>
        <div ref={listRef} className="relative">
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            aria-expanded={listOpen}
            aria-haspopup="listbox"
            className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-card pl-1 pr-3 text-[13px] font-medium hover:border-ring"
          >
            <DesignRound layers={layersOf(current)} className="size-8" />
            {nameOf(current)}{" "}
            <span aria-hidden className="text-muted-foreground">
              {listOpen ? "▴" : "▾"}
            </span>
          </button>
          {listOpen && (
            <ul
              role="listbox"
              aria-label={t("label")}
              className="absolute left-0 top-full z-40 mt-1 min-w-44 rounded-sm border border-border bg-popover p-1 text-popover-foreground shadow-lg"
            >
              {designs.map((d) => (
                <li key={d.slug} role="option" aria-selected={d.slug === current.slug}>
                  <button
                    type="button"
                    onClick={() => pick(d)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-[13px] hover:bg-muted",
                      d.slug === current.slug && "font-semibold"
                    )}
                  >
                    <DesignRound layers={layersOf(d)} className="size-7" />
                    {nameOf(d)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="text-[11.5px] text-muted-foreground">
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

      {/* Sheet mobile — solo nomi (risposta 2 del piano). */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          data-testid="design-switch-sheet"
          className="max-h-[70svh] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{t("sheetTitle")}</SheetTitle>
          </SheetHeader>
          <ul className="flex flex-col gap-1 px-4 pb-6">
            {designs.map((d) => (
              <li key={d.slug}>
                <button
                  type="button"
                  onClick={() => pick(d)}
                  aria-current={d.slug === current.slug ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center rounded-sm border px-3 py-2.5 text-left text-sm",
                    d.slug === current.slug
                      ? "border-primary bg-card font-semibold ring-1 ring-ring"
                      : "border-border bg-card"
                  )}
                >
                  {nameOf(d)}
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
