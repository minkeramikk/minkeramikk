"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
import { PaletteDedicationLine } from "@/components/ui-domain/palette-chip";
import { Dots } from "@/components/ui-domain/cart-line-row";
import { designLabel } from "@/lib/cart/cart";
import type { CartLayer } from "@/lib/cart/cart";
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
 * PR3 round 2 (TL): step 2's mobile «Palettes» tab is gone — palettes aren't
 * one more design option, they don't belong in that lane. Step 2 now opens
 * THIS SAME sheet from its own top control (configurator-client.tsx), same
 * as step 3 — one sheet, one way to manage palettes on a phone. That means
 * this component now has to do everything the tab's chips did: show the
 * draft (not just offer to save it), rename, delete — see the draft block
 * and `PaletteTile`'s own rename/delete below, neither existed before.
 *
 * Unlike `PaletteBar` (a pure shell — `chips`/`extra` arrive pre-composed),
 * this component owns its tile: the strip and the desktop bar need two very
 * different renderings of the same palette list (a horizontal chip vs. this
 * 2-column grid), and handing `PaletteChip` a size prop it was never
 * designed for risks the same coupling bug its own ✎/✕ reveal had. `code`
 * in, callbacks out — same contract as `PaletteChip`, no store access here
 * either. `sortCurrentDesignFirst` is called INSIDE (card §4-bis's own
 * rule), not pre-sorted by the caller: every other consumer of that
 * function (the bar's chip row) calls it at its own render site, not
 * through a prop, and this is one more.
 */
export function PaletteSheet({
  trigger,
  open,
  onOpenChange,
  palettes,
  currentDesignSlug,
  activeCode,
  draft,
  canSaveDraft,
  draftName,
  currentDedication,
  draftLayers,
  locale,
  onPick,
  onNewPalette,
  onSaveDraft,
  renamingCode,
  onRenameStart,
  onRenameConfirm,
  onRenameCancel,
  onDelete,
}: {
  /** The one control that opens this sheet (the strip's "Palettes ▾"
   *  button, or step 2's own top control). Rendered via `SheetTrigger
   *  asChild`, inside the SAME `<Sheet>` as `SheetContent` below — that's
   *  what lets Radix wire `aria-haspopup`, `aria-controls` and restore focus
   *  to it on close by itself (fix wave PR3 finding 9). `PaletteChip`'s ✎
   *  does the focus-restore part by hand because it has no single canonical
   *  opener to be a `Trigger` for; this button does. */
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
  /** R5-TEXT-IDENTITY (card §3 guard) — withholds JUST the "Save as palette"
   *  button inside the draft tile below; the tile itself (thumb + "Unsaved"
   *  + name) still shows whenever `draft` is true. True unless the draft's
   *  colours already match a saved palette of this design and only the
   *  inscription differs (caller's `draftMatchesSavedColours`). */
  canSaveDraft: boolean;
  /** The on-screen colours' own name/thumb (`nameFor()` or a saved match's
   *  name — the caller's single "what's painting" label, e.g. `paintingLabel`
   *  in ceramics-step.tsx / `activePaletteName` in configurator-client.tsx).
   *  Only rendered while `draft` — PR3 round 2: the removed step-2 tab's
   *  lead chip SHOWED the draft, not just a save button, and this sheet
   *  didn't; now it does, at both steps. */
  draftName: string;
  /**
   * TL correction (round after "the name is noise") — the field's live
   * value, ALWAYS, never a saved match's own stored words: this is what's
   * on screen right now, so it's what the draft tile shows below, AND
   * what the ACTIVE saved tile in the grid shows when its colours happen
   * to match (that tile is also, at that moment, the canvas — same
   * reasoning `PaletteChip`'s own lead chip follows). Every OTHER
   * (non-active) tile in the grid keeps reading its own stored
   * `palette.snapshot.customText` — those describe a different saved
   * configuration, not the canvas.
   */
  currentDedication?: string;
  draftLayers: CartLayer[];
  locale: "no" | "en";
  /** Picking a tile has the same effect as picking a chip on the desktop bar
   *  — the caller's own `paintWith`/`loadPalette`, this component navigates
   *  nothing itself. */
  onPick: (code: string) => void;
  /** "+ New palette" — the caller's own way to start a fresh one (step 3:
   *  `goToStep(2)` keeping the on-screen colours; step 2: `resetPaletteDraft`,
   *  back to the design's own defaults — same split the removed tab had). */
  onNewPalette: () => void;
  /** Only called while `draft` — mirrors the bar's `saveDraftAsPalette`. */
  onSaveDraft: () => void;
  /** The one palette code currently in rename mode (only one at a time,
   *  same rule `PaletteChip`'s callers already follow) — or `null`. */
  renamingCode: string | null;
  /** Fires when the ACTIVE tile's ✎ is activated — only the active tile
   *  ever gets rename (same scope fix wave PR3 finding 5 already settled
   *  for `PaletteChip` on a touch surface: a non-active tile stays
   *  select-only; loading it first, THEN renaming/deleting it, reaches
   *  every palette without widening every tile's chrome). */
  onRenameStart: (code: string) => void;
  /** Fires with the trimmed, non-empty new name on Enter or blur. */
  onRenameConfirm: (code: string, name: string) => void;
  /** Fires on Escape, or on Enter/blur with an empty/unchanged draft. */
  onRenameCancel: () => void;
  /** Delete (✕) — same active-only scope as rename above. No confirm step
   *  (deletePalette.ts's own comment carries the WHY). */
  onDelete: (code: string) => void;
}) {
  // TODO:nb-review — palettes.sheet.* NO copy is new, unreviewed (no live-site
  // source: R5-PALETTES). Everything ELSE below reuses palettes.bar.*/
  // palettes.chip.* on purpose: the title, the slot count, "Save as palette",
  // "New palette", "Unsaved", rename/delete labels are the exact same
  // strings the desktop bar and `PaletteChip` already show for the exact
  // same things — one name per concept, not a second copy of it for the sheet.
  //
  // Fix wave PR3 finding 12: `palettes.bar.paintHintSaved` is the ONE
  // exception — its copy says «tap a CHIP to switch», true on the desktop
  // bar, wrong here (this grid is TILES). `palettes.sheet.hintSaved` is its
  // own key for that reason alone; `paintHintDraft` has no such word in it
  // and is still shared, per the rule above.
  const t = useTranslations("palettes.sheet");
  const tBar = useTranslations("palettes.bar");
  const tChip = useTranslations("palettes.chip");
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
          {/* PR3 round 2: "show the draft", not only offer to save it — the
              removed step-2 tab's lead chip was a real thumb+name, this is
              its sheet equivalent. Same `draft` condition as the bar's
              `extra` slot (task 9's follow-up): only while the on-screen
              config matches no save — once it's saved, `draft` goes false
              and this whole block goes with it.

              R5-TEXT-IDENTITY (card §3 guard): the SAVE BUTTON alone is
              additionally gated on `canSaveDraft` — the tile (thumb +
              "Unsaved" + name) stays even when the offer is withheld, so the
              customer still sees exactly what's on screen. */}
          {draft && (
            <div
              data-testid="palette-sheet-draft"
              className="flex items-center gap-2.5 rounded-sm border border-dashed border-primary/50 px-2.5 py-2"
            >
              <DesignRound layers={draftLayers} className="size-8" />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[10px] tracking-[0.08em] text-primary uppercase">
                  {tChip("unsaved")}
                </span>
                <span className="block truncate text-xs font-medium">{draftName}</span>
                <PaletteDedicationLine text={currentDedication} className="max-w-none" />
              </span>
              {canSaveDraft && (
                <button
                  type="button"
                  data-testid="palette-sheet-save"
                  onClick={onSaveDraft}
                  className="flex h-11 shrink-0 items-center justify-center rounded-sm border-2 border-primary bg-primary/10 px-3 text-xs font-semibold hover:bg-primary/20"
                >
                  {tBar("save")}
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5" data-testid="palette-sheet-grid">
            {sorted.map((p) => {
              const dim = p.designSlug !== currentDesignSlug;
              const active = !dim && p.code === activeCode;
              return (
                <PaletteTile
                  key={p.code}
                  palette={p}
                  // TL correction: the ACTIVE tile IS the canvas right now
                  // when its colours match — it shows what's in the field
                  // (`currentDedication`), not this palette's own stored
                  // words. Every other tile keeps its own (below).
                  dedication={active ? currentDedication : p.snapshot.customText}
                  active={active}
                  dim={dim}
                  dimDesignName={dim ? (designLabel(p.snapshot, locale) ?? p.designSlug) : undefined}
                  onSelect={() => onPick(p.code)}
                  renaming={active && renamingCode === p.code}
                  onRenameStart={active ? () => onRenameStart(p.code) : undefined}
                  onRenameConfirm={active ? (name) => onRenameConfirm(p.code, name) : undefined}
                  onRenameCancel={active ? onRenameCancel : undefined}
                  onDelete={active ? () => onDelete(p.code) : undefined}
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
 * system) — no `size-11`-style rescue needed for the SELECT button, the way
 * `PaletteChip`'s needed one.
 *
 * PR3 round 2: rename/delete, which this tile never had. Same invalid-nesting
 * problem `PaletteChip`'s own doc comment already solved for the chip (a real
 * `<input>` can't sit inside a `<button>`) — same fix, an outer `<div>` with
 * the SELECT action, the rename input and the ✎/✕ actions as siblings, not
 * nested. Only ever passed to the ACTIVE tile (see `PaletteSheet` above):
 * `col-span-2` widens just that one row to fit them — every other tile stays
 * the compact select-only card it always was, zero change to that path.
 */
function PaletteTile({
  palette,
  dedication,
  active,
  dim,
  dimDesignName,
  renaming = false,
  onSelect,
  onRenameStart,
  onRenameConfirm,
  onRenameCancel,
  onDelete,
}: {
  palette: Palette;
  /** The caller already resolved WHOSE words this is — this palette's own
   *  stored `snapshot.customText`, or (only while `active`) the canvas's
   *  live one. This component just renders it; it does not decide. */
  dedication?: string;
  active: boolean;
  dim: boolean;
  /** The OTHER design's name — only meaningful (and only passed) when `dim`. */
  dimDesignName?: string;
  renaming?: boolean;
  onSelect: () => void;
  onRenameStart?: () => void;
  onRenameConfirm?: (name: string) => void;
  onRenameCancel?: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations("palettes.chip");
  const inputId = useId();
  const [draftName, setDraftName] = useState(palette.name);
  // Same double-commit guard as `PaletteChip` (Enter followed by a blur in
  // the same interaction).
  const settledRef = useRef(false);
  const selectRef = useRef<HTMLButtonElement>(null);
  const wasRenaming = useRef(renaming);

  useEffect(() => {
    if (renaming) {
      setDraftName(palette.name);
      settledRef.current = false;
    }
  }, [renaming, palette.name]);

  // Same focus-restore-to-opener as `PaletteChip` (fix wave B finding 4):
  // Enter/Esc unmount the `<input>` with no dialog primitive to catch the
  // fall, so the SELECT button reclaims focus by hand.
  useEffect(() => {
    if (wasRenaming.current && !renaming && document.activeElement === document.body) {
      selectRef.current?.focus();
    }
    wasRenaming.current = renaming;
  }, [renaming]);

  function settle(kind: "confirm" | "cancel") {
    if (settledRef.current) return;
    settledRef.current = true;
    if (kind === "cancel") {
      onRenameCancel?.();
      return;
    }
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== palette.name) onRenameConfirm?.(trimmed);
    else onRenameCancel?.();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      settle("confirm");
    } else if (e.key === "Escape") {
      e.preventDefault();
      settle("cancel");
    }
  }

  const hexes = palette.snapshot.selections
    .map((s) => s.hex)
    .filter((h): h is string => Boolean(h));
  const hasActions = Boolean(onRenameStart || onDelete);

  return (
    <div
      data-testid="palette-tile"
      data-code={palette.code}
      data-active={active || undefined}
      className={cn(
        "flex items-center gap-1 rounded-sm border px-2 py-1.5 text-left text-xs",
        hasActions && "col-span-2",
        active
          ? "border-primary bg-card shadow-[0_0_0_1px_var(--ring)]"
          : dim
            ? "border-border/60 bg-muted/40 opacity-50"
            : "border-border bg-card hover:border-ring"
      )}
    >
      {renaming ? (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <DesignRound layers={palette.layers} className="size-8" />
          <label htmlFor={inputId} className="sr-only">
            {t("renameLabel")}
          </label>
          <input
            id={inputId}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => settle("confirm")}
            autoFocus
            className="min-w-0 flex-1 rounded-md border border-input bg-card px-1.5 py-1 text-xs font-medium outline-none ring-2 ring-ring"
          />
        </span>
      ) : (
        <button
          ref={selectRef}
          type="button"
          onClick={onSelect}
          disabled={dim}
          aria-current={active ? "true" : undefined}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"
        >
          <DesignRound layers={palette.layers} className={cn("size-8", dim && "grayscale-[.3]")} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-medium">{palette.name}</span>
            {/* R5-TEXT-IDENTITY (TL ruling) — the caller already resolved
                whose words this is (this palette's own, or the canvas's
                while active); nothing decoded from `palette.code` here. */}
            {!dim && <PaletteDedicationLine text={dedication} className="max-w-none" />}
            <span className="block truncate text-[10px] text-muted-foreground">
              {/* Fix wave PR3 finding 6: was its own near-copy of `cart-line-row.tsx`'s
                  `Dots` (the mockup's `Dots(code)`) that had drifted off ADR 0008's
                  tokens-only rule — same colour swatches, now the one component. */}
              {dim ? dimDesignName : <Dots hexes={hexes} />}
            </span>
          </span>
        </button>
      )}
      {!renaming && onRenameStart && (
        <button
          type="button"
          onClick={onRenameStart}
          aria-label={t("rename")}
          title={t("rename")}
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
        >
          ✎
        </button>
      )}
      {!renaming && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={t("delete")}
          title={t("delete")}
          className="grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
        >
          ✕
        </button>
      )}
    </div>
  );
}
