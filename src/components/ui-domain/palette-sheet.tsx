"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DesignRound } from "@/components/ui-domain/design-round";
import { Dots } from "@/components/ui-domain/cart-line-row";
import { designLabel } from "@/lib/cart/cart";
import { MAX_PALETTES, sortCurrentDesignFirst, type Palette } from "@/lib/palettes/palettes";
import { cn } from "@/lib/utils";

/**
 * R5-PALETTES task 13 — the mockup's bottom sheet
 * (`docs/revision5/mockup-palettebar.html`, `Phone3`'s `sheet` branch +
 * `PTile`): the phone's way to see and change what's painting. The desktop
 * `PaletteBar` (§3.28) is `md:hidden`'d away below `md` (task 9) with
 * nothing standing in for it until now — this is that stand-in, opened from
 * the mobile strip's own "Palettes ▾" button.
 *
 * Unlike `PaletteBar` (a pure shell — `chips`/`extra` arrive pre-composed),
 * this component owns its tile: the strip and the desktop bar need two very
 * different renderings of the same palette list (a horizontal chip vs. this
 * 2-column grid), and handing `PaletteChip` a size prop it was never
 * designed for risks the same coupling bug its own ✎/✕ reveal had. `code`
 * in, callbacks out — same contract as `PaletteChip`, no store access here
 * either. `sortCurrentDesignFirst` is called INSIDE (card §4-bis's own
 * rule), not pre-sorted by the caller: every other consumer of that
 * function (the bar's chip row, step 2's tab) calls it at its own render
 * site, not through a prop, and this is one more.
 */
export function PaletteSheet({
  trigger,
  open,
  onOpenChange,
  palettes,
  currentDesignSlug,
  activeCode,
  draft,
  locale,
  onPick,
  onNewPalette,
  onSaveDraft,
}: {
  /** The one control that opens this sheet (the strip's "Palettes ▾"
   *  button). Rendered via `SheetTrigger asChild`, inside the SAME `<Sheet>`
   *  as `SheetContent` below — that's what lets Radix wire `aria-haspopup`,
   *  `aria-controls` and restore focus to it on close by itself (fix wave
   *  PR3 finding 9). `PaletteChip`'s ✎ does the focus-restore part by hand
   *  because it has no single canonical opener to be a `Trigger` for; this
   *  button does. */
  trigger: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every saved palette, any design — this component does its own sort/dim split. */
  palettes: Palette[];
  currentDesignSlug: string;
  /** The saved palette painting right now, or null when it's the unsaved draft. */
  activeCode: string | null;
  /** Mirrors `PaletteBar`'s own `draft` (R5-PALETTES follow-up) — the
   *  on-screen config matches no save, so the sheet offers "Save as
   *  palette" the same way the bar's `extra` slot does. */
  draft: boolean;
  locale: "no" | "en";
  /** Picking a tile has the same effect as picking a chip on the desktop bar
   *  — the caller's own `paintWith`, this component navigates nothing itself. */
  onPick: (code: string) => void;
  /** "+ New palette" — the caller's own `goToStep(2)`. */
  onNewPalette: () => void;
  /** Only called while `draft` — mirrors the bar's `saveDraftAsPalette`. */
  onSaveDraft: () => void;
}) {
  // TODO:nb-review — palettes.sheet.* NO copy is new, unreviewed (no live-site
  // source: R5-PALETTES). Everything ELSE below reuses palettes.bar.* on
  // purpose (DESIGN-SYSTEM §3.29's own rule for the step-2 tab): the title,
  // the slot count, "Save as palette" and "New palette" are the exact same
  // strings the desktop bar already shows for the exact same things — one
  // name per concept, not a second copy of it for the phone.
  //
  // Fix wave PR3 finding 12: `palettes.bar.paintHintSaved` is the ONE
  // exception — its copy says «tap a CHIP to switch», true on the desktop
  // bar, wrong here (this grid is TILES). `palettes.sheet.hintSaved` is its
  // own key for that reason alone; `paintHintDraft` has no such word in it
  // and is still shared, per the rule above.
  const t = useTranslations("palettes.sheet");
  const tBar = useTranslations("palettes.bar");
  const sorted = sortCurrentDesignFirst(palettes, currentDesignSlug);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        data-testid="palette-sheet"
        className="max-h-[85dvh] gap-3 overflow-y-auto rounded-t-xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="gap-0.5 pb-0">
          <SheetTitle>
            {tBar("eyebrowManage")}{" "}
            <span className="font-normal text-muted-foreground">
              · {tBar("manageCount", { count: palettes.length, max: MAX_PALETTES })}
            </span>
          </SheetTitle>
          <SheetDescription>{draft ? tBar("paintHintDraft") : t("hintSaved")}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4">
          {/* Same rule as the bar's `extra` slot (task 9's follow-up): only
              while the on-screen config matches no save — once it's saved,
              `draft` goes false and this button goes with it. */}
          {draft && (
            <button
              type="button"
              data-testid="palette-sheet-save"
              onClick={onSaveDraft}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-sm border-2 border-primary bg-primary/10 text-[13px] font-semibold hover:bg-primary/20"
            >
              {tBar("save")}
            </button>
          )}

          <div className="grid grid-cols-2 gap-1.5" data-testid="palette-sheet-grid">
            {sorted.map((p) => {
              const dim = p.designSlug !== currentDesignSlug;
              return (
                <PaletteTile
                  key={p.code}
                  palette={p}
                  active={!dim && p.code === activeCode}
                  dim={dim}
                  dimDesignName={dim ? (designLabel(p.snapshot, locale) ?? p.designSlug) : undefined}
                  onSelect={() => onPick(p.code)}
                />
              );
            })}
          </div>

          <button
            type="button"
            data-testid="palette-sheet-new"
            onClick={onNewPalette}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-primary/50 text-xs font-medium text-primary hover:bg-muted"
          >
            + {tBar("new")}
            <span className="font-normal text-muted-foreground">· {t("newHint")}</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The mockup's `PTile`. `px-2 py-1.5` around a 32px (`size-8`) thumb already
 * clears the 44px touch minimum on its own (32 + 6 + 6, §5 of the design
 * system) — no `size-11`-style rescue needed here the way `PaletteChip`'s
 * select button (task 13's carried-in fix) needed one.
 */
function PaletteTile({
  palette,
  active,
  dim,
  dimDesignName,
  onSelect,
}: {
  palette: Palette;
  active: boolean;
  dim: boolean;
  /** The OTHER design's name — only meaningful (and only passed) when `dim`. */
  dimDesignName?: string;
  onSelect: () => void;
}) {
  const hexes = palette.snapshot.selections
    .map((s) => s.hex)
    .filter((h): h is string => Boolean(h));

  return (
    <button
      type="button"
      data-testid="palette-tile"
      data-code={palette.code}
      data-active={active || undefined}
      onClick={onSelect}
      disabled={dim}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-sm border px-2 py-1.5 text-left text-xs",
        active
          ? "border-primary bg-card shadow-[0_0_0_1px_var(--ring)]"
          : dim
            ? "border-border/60 bg-muted/40 opacity-50"
            : "border-border bg-card hover:border-ring"
      )}
    >
      <DesignRound layers={palette.layers} className={cn("size-8", dim && "grayscale-[.3]")} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-medium">{palette.name}</span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {/* Fix wave PR3 finding 6: was its own near-copy of `cart-line-row.tsx`'s
              `Dots` (the mockup's `Dots(code)`) that had drifted off ADR 0008's
              tokens-only rule — same colour swatches, now the one component. */}
          {dim ? dimDesignName : <Dots hexes={hexes} />}
        </span>
      </span>
    </button>
  );
}
