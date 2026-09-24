"use client";

import { useTranslations } from "next-intl";
import { DesignRound } from "@/components/ui-domain/design-round";
import { PaletteDedicationLine } from "@/components/ui-domain/palette-chip";
import { PaletteSheet } from "@/components/ui-domain/palette-sheet";
import type { CartLayer } from "@/lib/cart/cart";
import type { Palette } from "@/lib/palettes/palettes";
import { cn } from "@/lib/utils";

/**
 * R5-PALETTES task 13, extracted (TL "menu sopra come step3", PR3 round 3):
 * step 3's own "what's painting" strip + its "Palettes ▾" sheet opener,
 * pulled out of ceramics-step.tsx so step 2 can mount the SAME thing instead
 * of the floating "Your palettes ▾" button it had (that button lived
 * INSIDE the editor card, above the option lane — this sits OUTSIDE it,
 * flush under the header, exactly like step 3). One component, one set of
 * pixels: a caller supplies its own "what's painting" values (`paintingLabel`
 * in ceramics-step.tsx, `activePaletteName` in configurator-client.tsx —
 * same concept, two file-local names) and this file owns the WHY that used
 * to live twice.
 */
export interface PaintingStripProps {
  /** Root `data-testid` — callers keep their own step's existing id
   *  (step 3's e2e spec already asserts on `step3-your-selection-strip`;
   *  changing it here would be the "single pixel" this extraction isn't
   *  allowed to move). */
  testId: string;
  /** The 36px composited thumb. */
  designLayers: CartLayer[];
  /** The ONE "what's painting" label — the caller's own, already-settled
   *  value (a saved match's name, else the deterministic draft label).
   *  Never recomputed here: doubling it up is exactly the drift this
   *  extraction removes. Also doubles as the sheet's `draftName`/
   *  `draftLayers` (below) — same reuse rule, one value in, not two. */
  paintingLabel: string;
  /**
   * R5-TEXT-CARRY — the CURRENT field value: this strip describes the
   * canvas, so this is never a saved match's own stored words. (Under
   * exact-code identity it couldn't be anyway: when a match IS showing,
   * the field holds that same palette's words — the decode effect re-seeds
   * it from the recalled code.) Forwarded to the sheet as
   * `currentDedication` (below) — same reuse as `paintingLabel`/`draftName`,
   * renamed there because the sheet only renders it on the draft tile.
   */
  dedication?: string;
  /** The design pattern's own name, shown as the "· design" suffix. */
  designName: string;
  palettes: Palette[];
  currentDesignSlug: string;
  activeCode: string | null;
  /** True when the on-screen config matches no save — the sheet then shows
   *  `paintingLabel` as its own "Unsaved" draft tile (palette-sheet.tsx),
   *  the same way the desktop bar's dashed `PaletteChip` reads "Unsaved".
   *  No separate copy needed here: this prop alone is what makes that read
   *  true at either step. */
  draft: boolean;
  /** R5-TEXT-CARRY — whether the draft TILE's own "Save as palette"
   *  button renders. Separate from `draft`: the tile itself (thumb +
   *  "Unsaved" + name) still shows whenever `draft` is true — the customer
   *  should always see what's actually on screen — but the SAVE offer only
   *  renders while the draft is unsaved. Under exact-code identity the
   *  caller's `canSaveDraft` is just `!exactMatch`, so callers pass their
   *  own value through. */
  canSaveDraft: boolean;
  locale: "no" | "en";
  onPick: (code: string) => void;
  onNewPalette: () => void;
  onSaveDraft: () => void;
  renamingCode: string | null;
  onRenameStart: (code: string) => void;
  onRenameConfirm: (code: string, name: string) => void;
  onRenameCancel: () => void;
  onDelete: (code: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Extra classes merged onto the root, e.g. configurator-client.tsx's own
   *  "release my sticky while the customer types" override (that concept
   *  doesn't exist at step 3, so ceramics-step.tsx simply never passes
   *  this — its render stays byte-for-byte the base classes below). */
  className?: string;
  /** R5-TUTORIAL round 3 fix wave — the mobile twin of the desktop
   *  `Hotspot` on `PaletteCard`'s "now" block (ceramics-step.tsx's own
   *  `(tip.sequence === "step3" && tip.n === 1) || (tip.sequence === "kit3"
   *  && tip.n === 2)`): same tip, same pulse, just on the "Palettes ▾"
   *  trigger below `md` since there's no `Hotspot` there. Only the trigger
   *  gets the ring, not the whole strip — a full-width pulse would be
   *  oversized. Step 2's call site has no such tip, so it never passes
   *  this. */
  tourPulse?: boolean;
}

export function PaintingStrip({
  testId,
  designLayers,
  paintingLabel,
  dedication,
  designName,
  palettes,
  currentDesignSlug,
  activeCode,
  draft,
  canSaveDraft,
  locale,
  onPick,
  onNewPalette,
  onSaveDraft,
  renamingCode,
  onRenameStart,
  onRenameConfirm,
  onRenameCancel,
  onDelete,
  open,
  onOpenChange,
  className,
  tourPulse,
}: PaintingStripProps) {
  const tPaletteBar = useTranslations("palettes.bar");
  const tSheet = useTranslations("palettes.sheet");

  return (
    <div
      data-testid={testId}
      // `-mx-5 px-4`: cancel `main`'s own `px-5` (public-shell.tsx) and
      // re-pad with the mockup's own value — the strip runs edge-to-edge,
      // not boxed like the card it replaces at either step.
      // `-mt-7` cancels `main`'s TOP padding too: without it `main`'s 28px
      // `py-7` sits above the strip as dead space between the sticky site
      // header and the strip on first paint. `sticky top-14` below is
      // unaffected: that's a scroll-threshold, not a static offset — it's
      // also why this strip works as the SECOND sticky layer wherever a
      // caller stacks something else under it (step 2's canvas/tab lane
      // shift their own `top` by this strip's rendered height, not by
      // anything this file does).
      className={cn(
        "sticky top-14 z-30 -mx-5 -mt-7 mb-3.5 flex items-center gap-2.5 border-b border-border bg-[var(--mk-canvas)] px-4 py-2 md:hidden",
        className
      )}
    >
      {/* Daniele (live test): the tip talks about "this palette" — the
          painting-with block on the left IS that palette, not the switcher
          on the right, so the pulse belongs here. */}
      <div
        className={cn(
          "flex min-w-0 items-center gap-2.5 rounded-lg",
          tourPulse && "tour-pulse"
        )}
      >
        <DesignRound layers={designLayers} className="size-9" />
        {/* `paintingLabel`, not a second computation — the caller's own one
            name for "what's painting" (its own file-scoped comment explains
            where that gets settled once). */}
        <div className="min-w-0 leading-tight">
          <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            {tPaletteBar("eyebrowPaint")}
          </p>
          <p className="truncate text-[13.5px] font-semibold">
            {paintingLabel}{" "}
            <span className="font-normal text-muted-foreground">· {designName}</span>
          </p>
          <PaletteDedicationLine text={dedication} className="max-w-none" />
        </div>
      </div>
      {/* Fix wave PR3 finding 9: the strip is the sheet's ONE opener — a real
          `SheetTrigger` (not a hand-rolled button) gets `aria-haspopup`,
          `aria-controls` and, on close, focus restored to THIS button for
          free (Radix's `triggerRef`, wired only when a `Trigger` is used).
          `PaletteChip`'s own rename input restores focus by hand because it
          has no single canonical opener to be a `Trigger` for — this button
          does, so it gets the real thing instead of a second hand-rolled copy. */}
      <PaletteSheet
        trigger={
          <button
            type="button"
            data-testid="palette-sheet-trigger"
            // `min-h-11 sm:min-h-9`: same touch-target rescue as `PaletteChip`'s
            // select button (task 13's carried-in fix) — the mockup's own `h-9`
            // (36px) is a mouse-era size, kept only from `sm` up.
            className={cn(
              "ml-auto flex min-h-11 shrink-0 items-center gap-1 rounded-full border bg-card px-3 text-[12.5px] font-medium sm:min-h-9",
              open ? "border-primary shadow-[0_0_0_1px_var(--ring)]" : "border-border"
            )}
          >
            {tSheet("trigger")}
            <span aria-hidden className="text-muted-foreground">
              {open ? "▴" : "▾"}
            </span>
          </button>
        }
        open={open}
        onOpenChange={onOpenChange}
        palettes={palettes}
        currentDesignSlug={currentDesignSlug}
        activeCode={activeCode}
        draft={draft}
        canSaveDraft={canSaveDraft}
        draftName={paintingLabel}
        currentDedication={dedication}
        draftLayers={designLayers}
        locale={locale}
        onPick={onPick}
        onNewPalette={onNewPalette}
        onSaveDraft={onSaveDraft}
        // PR3 round 2: the sheet gained rename/delete (it had neither) so it
        // can do what the removed step-2 tab's chips did, now that step 2
        // opens this SAME sheet too — the caller passes its own
        // `renamingPaletteCode`/`renamePalette`/`deletePalette`, already
        // wired the same way its own bar/lane chips use them.
        renamingCode={renamingCode}
        onRenameStart={onRenameStart}
        onRenameConfirm={onRenameConfirm}
        onRenameCancel={onRenameCancel}
        onDelete={onDelete}
      />
    </div>
  );
}
