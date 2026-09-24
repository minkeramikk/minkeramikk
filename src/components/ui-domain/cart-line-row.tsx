"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { Brush, Eraser, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DesignRound } from "@/components/ui-domain/design-round";
import { PaletteDedicationLine } from "@/components/ui-domain/palette-chip";
import { SetBadge } from "@/components/ui-domain/set-badge";
import { formatMoney, money } from "@/lib/money/money";
import { designLabel, type CartLayer, type CartLine } from "@/lib/cart/cart";
import { formatSelections } from "@/lib/configurator/readable-selections";
import { sortCurrentDesignFirst, type Palette } from "@/lib/palettes/palettes";
import { paletteMatchingCode } from "@/lib/configurator/save-gate";
import type { LineDiscount } from "@/lib/discounts/discount";
import type { TextPosition } from "@/lib/configurator/text-position";
import { cn } from "@/lib/utils";

/**
 * First selection colour of a line → colour-chip fallback for the row's own
 * thumb (and CartLineThumb's, elsewhere).
 * Moved here from ceramics-step.tsx (task 8). Two callers: this row and
 * `unpaint-dialog.tsx`'s line card — which is why it is exported rather than
 * local (task 11): the dialog needs the exact same fallback for the line it
 * is unpainting, and a second copy would drift. `cart-menu.tsx` used to keep
 * an identical copy for the steps 1–2 drawer; that drawer is `<Basket>` now
 * (task 5) and the copy is gone.
 */
export function thumbHex(line: CartLine): string | undefined {
  return line.configSnapshot?.selections.find((s) => s.hex)?.hex ?? undefined;
}

/**
 * R5-BASKET-HOST task 2 — the basket row (DESIGN-SYSTEM §3.14), rendered by
 * BOTH hosts: step 3's column and the header drawer mount the same
 * `<Basket>`, and it mounts this. A two-column grid
 * (`[auto_minmax(0,1fr)]`) carries the thumb and the info; from `sm` the
 * actions row sits in column 2, `self-end`, and below `sm` it spans both,
 * full width. (Task 2 shipped this as a plain vertical stack with no grid;
 * `c614fda` brought the grid back for AC 8 — no empty band beside the
 * photo.) Then the picker/expand/details blocks in turn. Binding source:
 * `BRow` in
 * `.superpowers/sdd/2026-09-19-r5-basket-host/mockup-brow.md` — the icons on
 * the Unpaint/Remove actions still follow that mockup's `Ico.unpaint`/
 * `Ico.trash` glyphs (lucide `Eraser`/`Trash2` here).
 *
 * Owns NO state: `open`/`onToggleDetails` and every mutation arrive as props
 * — the "how many to paint" number (`n`) is no exception, it lives in the
 * parent's `Record<lineId, number>` (mirrors the mockup's `S3.n[id]`) and
 * arrives here as `n`/`onN`, so this stays a pure render of whatever the
 * parent's cart state is right now.
 *
 * The details panel below is the drilldown: composed preview, config,
 * ceramic, price. It is the ONLY such panel — `CartLineRecap`, the drawer's
 * old recap, was deleted in R5-BASKET-HOST once the drawer started rendering
 * `<Basket>` (`b6d939f`).
 */
/**
 * The line's colours as dots. TL, 18/9: on the row the dots ARE the colours —
 * spelling the names out next to them only bought a truncation («Amalfi Dyr NO
 * ●●●● · Esel · Verde…»). The names live one tap away, in the details panel.
 *
 * Exported (fix wave PR3 finding 6): `palette-sheet.tsx`'s `PaletteTile` drew
 * the same dots from a near-identical copy, `PaletteDots` — and that copy
 * had drifted off ADR 0008 (`border-black/10` instead of the `border-border`
 * token). One component, one border colour, not two to keep in sync.
 */
export function Dots({ hexes }: { hexes: string[] }) {
  if (hexes.length === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {hexes.map((hex, i) => (
        <span
          key={`${hex}-${i}`}
          aria-hidden
          className="size-2.5 rounded-full border border-border"
          style={{ background: hex }}
        />
      ))}
    </span>
  );
}

export function CartLineRow({
  line,
  locale,
  d,
  open,
  onToggleDetails,
  onQty,
  onRemove,
  onPaint,
  onUnpaint,
  n,
  onN,
  currentThumb,
  palettes,
  currentDesignSlug,
  pickerOpen,
  onTogglePicker,
  onPickPalette,
  onOpenPhoto,
  paintTarget,
  detailSlot,
}: {
  line: CartLine;
  locale: "no" | "en";
  d: LineDiscount;
  open: boolean;
  onToggleDetails: () => void;
  onQty: (quantity: number) => void;
  onRemove: () => void;
  onPaint: (n: number) => void;
  onUnpaint: () => void;
  /** How many of `line.quantity` the Paint button will move — owned by the
   *  parent (see class comment above), clamped there to [1, line.quantity]. */
  n: number;
  onN: (next: number) => void;
  /** The row's OWN palette pick (task 10) — the parent already resolved the
   *  "untouched" default (the active on-screen config) vs. a saved palette
   *  the customer chose from this row's picker, so `code` here is always
   *  what Paint would apply. `label`/`hexes` follow the same resolution:
   *  a saved palette's name/colours, or the design's when it isn't one yet. */
  currentThumb: {
    layers: CartLayer[];
    label: string;
    /**
     * R5-TEXT-CARRY — THIS ROW's own words, never borrowed from anywhere
     * else. `basket.tsx`'s `rowThumb()` sets this from the row's own
     * `snapshot.customText` in both branches: untouched, the row's
     * configuration simply IS the canvas's; explicitly picked, the row
     * paints the picked palette's whole snapshot — colours AND dedication
     * (`explicitPickThumb`, `basket-host.ts`). Never the canvas's words in
     * the explicit case (see the picker pills below, which show the row's
     * own pick for the active pill).
     */
    dedication?: string;
    /** DS §3.33 — rides alongside `dedication`, same source, same rule:
     *  `?? "centre"` only at the read site, never a second default here. */
    textPosition?: TextPosition;
    hexes: string[];
    code: string;
    /** R5-TEXT-CARRY: how many colour segments `code` has — carried for the
     *  picker's thumb contract (`explicitPickThumb`), not for matching. */
    selectionCount: number;
  };
  /** Every saved palette (R5-PALETTES store) — this row does its own pure
   *  lookups against it: a painted line's own `configCode` → its name (info
   *  line + details), and the picker's pill list. No palette STATE lives
   *  here, only this read (card's own rule: the row owns none). */
  palettes: Palette[];
  /** The design on screen — dims/disables a picker pill from another design,
   *  same rule the palette bar's own chips already follow (card §6). */
  currentDesignSlug: string;
  /** Task 10 — this row's own picker, open/closed. Only meaningful while
   *  `unpainted` (the picker only exists on an unpainted row's chip). */
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onPickPalette: (code: string) => void;
  /** R5-BASKET-HOST task 2 — fires on the whole 64×132 thumb button; task 3
   *  wired it to `LineLightbox` and `basket.tsx` passes it. Still optional,
   *  and `undefined` is meaningful: `Basket` withholds it for a line with
   *  neither `plateImage` nor `layers` (a pre-F19 line — both optional, no
   *  migration), and the thumb then stays inert markup — no button, no `⤢`
   *  affordance — because there is nothing to open. */
  onOpenPhoto?: () => void;
  /** R5-BASKET-HOST task 2 — `"palette"` is step 3's behaviour (picker
   *  + n/N + Paint, unchanged). `"none"` is the header drawer's step-1 case
   *  (wired in task 5): there is no configuration on screen to paint with, so
   *  the chip goes dead (disabled, muted) and a link sends the customer to
   *  step 2 instead — Paint, the n/N stepper and the picker panel all hide. */
  paintTarget: { kind: "palette" } | { kind: "none"; href: string };
  /** R5-BASKET-HOST task 5 — one host-specific block at the foot of the
   *  details panel. The DRAWER puts the MK code, its copy button and «Edit
   *  design» there (task 18's ruling: those belong to the drawer, not to
   *  this step-3 drilldown); they used to ride on the drawer's own recap,
   *  deleted in `b6d939f`. The column passes nothing and its panel is
   *  unchanged. */
  detailSlot?: React.ReactNode;
}) {
  // TODO:nb-review — cart.unpainted.* / cart.unpaint.action NO copy is new,
  // unreviewed (mirrors cart.buttonUnpainted's own "umalt/umalte" wording).
  // cart.chooseColours and cart.line.seePhotos are the same batch (task 2).
  const t = useTranslations("cart");
  // Review fix — the picker toggle needs a stable id to point `aria-controls`
  // at; `useId()` (not the line/cart id) so two rows never collide even if a
  // line id somehow repeats within one render.
  const pickerPanelId = useId();
  // Fix wave B finding 4 — picking a pill unmounts the panel (mirrors the
  // unpaint dialog's own `onCloseAutoFocus`, DESIGN-SYSTEM §3.14, but this
  // toggle is a plain disclosure, not a Radix primitive, so there's no such
  // hook to hang the restore on). Only reclaim focus when it actually fell
  // to `<body>` — a Tab out of the panel already sent focus somewhere real
  // before this effect runs, and forcing it back to the toggle would fight
  // that legitimate move.
  const pickerToggleRef = useRef<HTMLButtonElement>(null);
  const wasPickerOpen = useRef(pickerOpen);
  useEffect(() => {
    if (wasPickerOpen.current && !pickerOpen && document.activeElement === document.body) {
      pickerToggleRef.current?.focus();
    }
    wasPickerOpen.current = pickerOpen;
  }, [pickerOpen]);
  const unpainted = line.configCode === null;
  // Fix wave B finding 2 — zero saved palettes is the state every customer
  // starts in; the ▾ promises a picker, and with nothing to pick that
  // promise is empty (an open panel with no pills in it). The chip already
  // has a rule for this (no affordance it can't back up), so the toggle
  // follows it: no ▾, and the button goes inert (`disabled`, not just
  // unstyled) instead of opening on nothing.
  const hasPalettes = palettes.length > 0;
  const isSet = (line.pieces ?? 1) > 1;
  // R5-PALETTES §4-bis: locale-picked like productNameNo/En — undefined on a
  // legacy line, and the info line below prints nothing for it (AC 5).
  const sizeLabel = locale === "no" ? line.sizeLabelNo : line.sizeLabelEn;
  // `customNote` is present (possibly "") only when the design takes notes;
  // non-empty ⇒ the customer's colours, "" ⇒ the studio's, absent ⇒ no badge.
  // The rule predates this row and outlived the recap it came from.
  const note = line.configSnapshot?.customNote;
  const colourVariant = note === undefined ? null : note.trim() ? "custom" : "studio";
  // R5-TEXT-CARRY — a painted row is named by the palette it was
  // painted WITH (read from the store by the line's own frozen `configCode`),
  // not the design: two rows of the same design can carry different
  // palettes, and the design name no longer disambiguates them. Falls back
  // to the design name when the code isn't (or is no longer, LRU eviction)
  // a saved palette — e.g. every line painted before R5-PALETTES existed.
  //
  // An EXACT code match (`paletteMatchingCode`): the dedication is identity
  // now, so a line carrying "Mons" is simply not the saved "Trude" palette —
  // it falls back to the design name instead of borrowing another
  // dedication's name.
  const paletteName = !unpainted && line.configCode && line.configSnapshot
    ? (paletteMatchingCode(palettes, line.configCode, line.configSnapshot.designSlug)?.name
        ?? designLabel(line.configSnapshot, locale) ?? null)
    : null;

  // Task 2 — the design square of the big thumb: the row's OWN colours once
  // painted, the on-screen config's while still unpainted (same source
  // CartLineThumb used to read, `unpainted ? currentThumb.layers : line.layers`).
  const designLayers = unpainted ? currentThumb.layers : line.layers;
  const hasDesignLayers = !unpainted && designLayers && designLayers.length > 0;
  const designHex = thumbHex(line);

  const bigThumb = (
    <>
      <span
        aria-hidden
        className={cn(
          "relative block size-16 overflow-hidden rounded-md border",
          unpainted ? "border-dashed border-primary/50 bg-muted" : "border-border bg-[var(--mk-canvas)]"
        )}
        style={!unpainted && !hasDesignLayers && designHex ? { backgroundColor: designHex } : undefined}
      >
        {unpainted ? (
          <span className="grid size-full place-items-center text-[20px] text-primary/50">◌</span>
        ) : (
          hasDesignLayers &&
          designLayers.map((l, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- composited catalog art from storage
            <img
              key={`${l.src}-${i}`}
              src={l.src}
              alt=""
              className="absolute inset-0 size-full object-contain"
              style={l.recolor ? { mixBlendMode: "multiply" } : undefined}
            />
          ))
        )}
      </span>
      {/* No photo yet → skip the second square entirely, not an empty muted box. */}
      {line.plateImage && (
        <span
          aria-hidden
          className="relative block size-16 overflow-hidden rounded-md border border-border bg-muted"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- chosen ceramic photo from storage */}
          <img
            src={line.plateImage}
            alt=""
            className="absolute inset-0 size-full object-contain p-1"
          />
          {onOpenPhoto && (
            <span className="absolute bottom-0.5 right-0.5 grid size-5 place-items-center rounded-[5px] bg-ink/75 text-[10px] text-ink-foreground">
              ⤢
            </span>
          )}
        </span>
      )}
    </>
  );

  return (
    <div
      data-testid="cart-line"
      data-unpainted={unpainted || undefined}
      // Fix round 4 (QA across containers) — `@container/row`: this row
      // mounts in containers of very different widths (the step-3 column and
      // the drawer; there was a third, the mobile in-flow copy, until PR 2),
      // and what decides whether the actions fit beside the thumb is THAT
      // width, not the viewport's. Every `sm:`/`lg:` below that governed the
      // column-2/full-width switch is now `row-wide:` (fix round 5, card
      // §4-ter — a `@custom-variant` in `globals.css`, so the `416` behind
      // it lives in one place, not copied across a dozen class strings).
      // NAMED (`/row`), not the bare `@container`: a `@container` nested
      // inside the row later (a picker panel, a lightbox trigger) binds its
      // own query instead of silently answering this one. `sm:`/`md:` that
      // size a TAP TARGET (`size-11 sm:size-9`, `min-h-11 md:min-h-0`, and
      // friends) stay viewport-based on purpose: a finger is a property of
      // the device holding it, not of the container the row renders in.
      className="@container/row border-b border-border/60 py-3.5 last:border-0"
    >
      {/* AC 8 (Precisazione 19/9 bis) — a grid, not two layouts: the thumb
          spans both rows (`row-span-2`); the actions row lives in column 2
          above the container threshold, `self-end` so it aligns with the
          CERAMIC PHOTO square (task 2's `<div class="mt-3 flex">`
          full-width sibling left a ~64px empty band beside that photo on
          every row — this is what restores card 1 §3's own fix). Below the
          threshold the actions row still spans both columns, full width,
          under the whole block — chip · n/N · Paint (or the stepper +
          expand/unpaint/remove group) don't fit beside the thumb there.
          `minmax(0,1fr)`, never a bare `1fr`: the trap this row has paid
          for twice — a bare `1fr` is `minmax(auto,1fr)` and refuses to
          shrink below its content's min-content width. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5">
        {/* Task 2 — the 64+64 stacked thumb (mockup `BigThumb`, `mode="stack"`).
            A real `<button>` when `onOpenPhoto` is passed (task 3 wires it to
            `LineLightbox`), inert markup with no `⤢` disc when it is not —
            the affordance must never promise a click that isn't there. Do NOT
            reach for `CartLineThumb` here: its sizes and its `compact`
            flex-switch belong to the offers list, not this row. */}
        {onOpenPhoto ? (
          <button
            type="button"
            onClick={onOpenPhoto}
            aria-label={t("line.seePhotos")}
            className="group relative row-span-2 flex shrink-0 flex-col gap-1"
          >
            {bigThumb}
          </button>
        ) : (
          <div className="relative row-span-2 flex shrink-0 flex-col gap-1">{bigThumb}</div>
        )}

        {/* Task 2 — info column: name, then palette-or-unpainted line, then
            (painted only, per the mockup) the size/set-of-N line. `min-w-0`
            here and on every truncating child: the trap this row has already
            paid for twice — a nowrap flex item can't shrink below its own
            content width without it. Auto-placed into column 2, row 1 —
            the actions row (below) is column 2's second grid item. */}
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold leading-tight">
                {locale === "no" ? line.productNameNo : line.productNameEn}
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-[13px]">
                {unpainted ? (
                  <>
                    <span className="font-medium text-warn-on-light">○ {t("unpainted.label")}</span>
                    <span className="text-muted-foreground">
                      {/* Fix round 2 (finding 7): the mockup prints the LINE's
                          own quantity, not physical pieces — a set-of-3 ×2
                          line is "2 sets", not "6 pieces". Same unit
                          vocabulary as the unpaint dialog, not a third one. */}
                      · {line.quantity}{" "}
                      {t(isSet ? "unpaintDialog.unitSet" : "unpaintDialog.unitPiece", {
                        count: line.quantity,
                      })}
                    </span>
                  </>
                ) : (
                  <>
                    {/* TL, 18/9: with the colour NAMES gone (see Dots), the
                        name has the line to itself and only truncates when
                        it is genuinely too long for the column. Task 10:
                        the PALETTE's name now, not the design's — see
                        `paletteName` above. */}
                    {line.layers && line.layers.length > 0 && (
                      <DesignRound layers={line.layers} className="size-5 rounded-sm" />
                    )}
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {paletteName ?? "—"}
                    </span>
                    <Dots
                      hexes={(line.configSnapshot?.selections ?? [])
                        .map((sel) => sel.hex)
                        .filter((hex): hex is string => Boolean(hex))}
                    />
                  </>
                )}
              </span>
              {/* Mockup gates this line on `!unp` — an unpainted row already
                  says "set" vs "piece" on the line above (unitSet/unitPiece),
                  so a second set marker here would just repeat it. `SetBadge`
                  (not the mockup's plain "· set of N" text) reuses the one
                  already-reviewed copy for this instead of a new, unreviewed
                  string. */}
              {!unpainted && (sizeLabel || isSet) && (
                <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  {sizeLabel}
                  <SetBadge count={line.pieces ?? 1} />
                </span>
              )}
            </span>
            <span className="shrink-0 text-right leading-tight">
              {d.pct > 0 && (
                <s
                  data-testid="cart-line-full"
                  aria-hidden
                  className="block text-[12px] tabular-nums text-muted-foreground line-through"
                >
                  {formatMoney(d.full, locale)}
                </s>
              )}
              <span data-testid="cart-line-net" className="block text-[14px] tabular-nums">
                {formatMoney(d.net, locale)}
              </span>
            </span>
          </div>
        </div>

        {/* actions row — column 2, `self-end` above the container
            threshold (AC 8: aligns with the ceramic photo, no more empty
            band beside it); full width (both columns) below it, where
            chip · n/N · Paint (or the painted row's stepper + group) don't
            fit beside the thumb. Mockup `BRow`'s `!unp` branch: the qty
            stepper, expand, unpaint and remove on a painted line are ONE
            row, not split across two.

            Fix round 5 (card §4-ter) — `row-wide:`, not `sm:`/`lg:`/a
            scattered `@[416px]:`: the switch is a property of THIS ROW'S
            OWN width (the named container `@container/row`, above), not
            of the viewport, and the `416` behind `row-wide` now lives in
            ONE place — the `@custom-variant` in `globals.css`, comment and
            all (full arithmetic there, not copied here). The column and
            the drawer render the same row at unrelated widths for the same
            viewport (three containers until PR 2 deleted the mobile in-flow
            copy); a viewport query picked
            whichever arrangement the rail wanted, so the drawer at desktop
            viewports got column 2 too, with only ~309px of it, wrapping
            inside a shape nobody chose. Below `row-wide`, `flex-wrap` can
            still drop the actions group to its own line (fix round 3's
            behaviour, e.g. 390px in `/no/`) — two shapes chosen by
            measured fit, nothing in between. */}
        <div
          className={cn(
            "col-span-2 mt-3 flex min-w-0 items-center gap-2",
            "row-wide:col-span-1 row-wide:col-start-2 row-wide:row-start-2 row-wide:mt-0 row-wide:self-end",
            // `flex-wrap`'s line-fit decision uses each item's hypothetical
            // (un-shrunk) size, not how far it *can* shrink — so an item
            // needs an actual cap (`max-width`, or a `0` flex-basis) to not
            // be what forces a wrap; `min-width` alone doesn't do it. The
            // unpainted chip is the one item here that absorbs slack
            // (`flex-1 min-w-0`, its label truncates); Paint's label is
            // `max-w`-capped; the painted row's stepper and its
            // expand/unpaint/remove group are both `shrink-0` — rigid, so
            // if they don't both fit, `flex-wrap` drops the group whole
            // (fix round 3) rather than the two overflowing. `flex-wrap`
            // stays ON at every width: even past the `row-wide` threshold
            // the container can still be tight (the drawer's own sanity
            // check, `globals.css`), so nothing here ever assumes "wide,
            // don't bother".
            "flex-wrap row-wide:gap-1.5"
          )}
        >
          {unpainted ? (
            paintTarget.kind === "none" ? (
              // Card §1: at step 1 there's no configuration on screen to paint
              // with, so the chip IS the link to step 2 — not a disabled chip
              // plus a separate text link. No `DesignRound` here either: with
              // no config, `layers` is `[]` and it painted an empty circle.
              <Link
                href={paintTarget.href}
                data-testid="paint-chip"
                className="inline-flex min-h-11 -my-2 items-center py-2 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground md:my-0 md:min-h-0 md:py-0"
              >
                {t("chooseColours")}
              </Link>
            ) : (
              <>
                <button
                  ref={pickerToggleRef}
                  type="button"
                  data-testid="paint-chip"
                  data-code={currentThumb.code}
                  disabled={!hasPalettes}
                  aria-expanded={hasPalettes ? pickerOpen : undefined}
                  // Only meaningful while the panel it names exists.
                  aria-controls={hasPalettes && pickerOpen ? pickerPanelId : undefined}
                  onClick={hasPalettes ? onTogglePicker : undefined}
                  // `flex-1 min-w-0` + `flex-basis: 0`: the chip absorbs
                  // whatever the stepper and Paint (fixed intrinsic widths)
                  // leave behind, so it's never what forces a wrap.
                  // `row-wide:flex-initial`, NOT `flex-none`: `flex-none`
                  // has no shrink, so a long `formatSelections` label can't
                  // truncate and pushes Paint out of the panel —
                  // `flex-initial` keeps the shrink permission the label's
                  // `truncate` needs. Same named-container variant as the
                  // actions row's own switch (`globals.css`) — one
                  // threshold, not a second guess at where "enough room"
                  // starts.
                  className={cn(
                    // `min-h-11 sm:min-h-9`, not a fixed height: the
                    // dedication line (R5-TEXT-IDENTITY) is a genuine
                    // second line, same "let it grow" fix every other tile
                    // needed.
                    "flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-sm border bg-card pl-1 pr-1 text-xs font-medium sm:min-h-9 row-wide:flex-initial row-wide:gap-1.5 row-wide:pr-2",
                    pickerOpen
                      ? "border-primary shadow-[0_0_0_1px_var(--ring)]"
                      : "border-border",
                    !hasPalettes && "disabled:cursor-not-allowed"
                  )}
                >
                  <DesignRound layers={currentThumb.layers} className="size-6 shrink-0 rounded-sm" />
                  {/* No dots here (unlike the painted row's info line below):
                      the name is this chip's identity, and dots would eat the
                      width it needs at 390. */}
                  <span className="flex min-w-0 flex-col items-start leading-tight">
                    <span className="min-w-0 max-w-full truncate">{currentThumb.label}</span>
                    <PaletteDedicationLine
                      text={currentThumb.dedication}
                      position={currentThumb.textPosition ?? "centre"}
                      className="max-w-full"
                    />
                  </span>
                  {hasPalettes && (
                    <span aria-hidden className="shrink-0 text-muted-foreground">
                      {pickerOpen ? "▴" : "▾"}
                    </span>
                  )}
                </button>
                <div
                  role="group"
                  aria-label={t("unpainted.paintCount")}
                  className="flex h-11 items-center rounded-sm border border-border bg-card sm:h-9"
                >
                  <button
                    type="button"
                    aria-label={t("decreaseQty")}
                    data-testid="paint-n-dec"
                    onClick={() => onN(Math.max(1, n - 1))}
                    className="flex size-11 items-center justify-center sm:size-9"
                  >
                    −
                  </button>
                  {/* `min-w-8 px-1` not a fixed `w-8`: a two-digit quantity
                      ("10/12") is wider than 32px and would overflow into
                      the −/+ buttons on either side otherwise. */}
                  <span className="min-w-8 px-1 text-center text-sm tabular-nums" aria-live="polite">
                    {n}
                    <span className="text-muted-foreground">/{line.quantity}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={t("increaseQty")}
                    data-testid="paint-n-inc"
                    onClick={() => onN(Math.min(line.quantity, n + 1))}
                    className="flex size-11 items-center justify-center sm:size-9"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  data-testid="paint-line"
                  onClick={() => onPaint(n)}
                  // `min-w-0` + the label's own `max-w`/`truncate`: the word
                  // can give ground before the icon/badge do.
                  // `row-wide:min-w-max` resets that shrink permission,
                  // same named-container gate as the chip's.
                  className="relative ml-auto flex h-11 min-w-0 items-center gap-1 rounded-sm bg-primary px-2 text-xs font-semibold text-primary-foreground sm:h-9 row-wide:min-w-max row-wide:gap-1.5 row-wide:px-3.5"
                >
                  <Brush className="size-3.5 shrink-0" aria-hidden />
                  <span className="max-w-[52px] truncate">{t("unpainted.paint")}</span>
                  {/* Reads from 2 upward, not only the partial case: any row
                      with more than one unit to choose from shows its current
                      n (a single-unit row, always 1 of 1, shows none) — the
                      badge is the count Paint is about to act on. */}
                  <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-ink text-[10px] font-bold text-ink-foreground shadow">
                    {n}
                  </span>
                </button>
              </>
            )
          ) : (
            <>
              <div
                role="group"
                aria-label={t("quantity")}
                className="flex h-11 shrink-0 items-center rounded-sm border border-border bg-card sm:h-9"
              >
                <button
                  type="button"
                  aria-label={t("decreaseQty")}
                  data-testid="docked-qty-dec"
                  onClick={() => onQty(line.quantity - 1)}
                  className="flex size-11 items-center justify-center sm:size-9"
                >
                  −
                </button>
                <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
                  {line.quantity}
                </span>
                <button
                  type="button"
                  aria-label={t("increaseQty")}
                  data-testid="docked-qty-inc"
                  onClick={() => onQty(line.quantity + 1)}
                  className="flex size-11 items-center justify-center sm:size-9"
                >
                  +
                </button>
              </div>
              {/* Fix round 3 (QA on preview) — expand, unpaint and remove are
                  now ONE group, `ml-auto`, trash always last: grouping them
                  (rather than leaving «Show details» to sit on its own
                  between the stepper and the unpaint/remove pair, card 1
                  §3's original arrangement) means that if the row runs out
                  of width, the WHOLE group wraps to its own line — not just
                  the one text item stranded alone, which is what happened
                  when it was the only child here with room to shrink.
                  `h-9 items-end` (not `items-center`): the group's own
                  height matches the stepper's (`sm:h-9`), and every child in
                  it bottom-aligns within that box — the stepper's own
                  content already fills its box edge-to-edge (its −/+
                  buttons are exactly as tall as the box), so this is what
                  puts the group's visible bottom on the same line as the
                  stepper's, which `self-end` (the grid, above) already put
                  level with the ceramic photo. The `h-3 w-px bg-border`
                  dividers get `mb-1` for the same reason: centred on the
                  TEXT, not on the (taller, below `md`) button box around it.
                  `shrink-0` on the group itself, not only on what's inside
                  it (and on the stepper too, below) — without it the OUTER
                  row's flex-shrink squeezed the group's own box below its
                  children's combined width (a real bug caught by
                  measuring: the dividers silently collapsed to 0px and the
                  buttons still overflowed the assigned box) instead of
                  leaving the row's `flex-wrap` to drop the group to its
                  own line, whole, the way it's supposed to. Both direct
                  children of the actions row are now rigid, so the only
                  thing that can happen when they don't both fit is a wrap,
                  never a squeeze. */}
              <span className="ml-auto flex h-9 shrink-0 items-end gap-3">
                {line.configSnapshot && (
                  <>
                    <button
                      type="button"
                      data-testid="cart-expand"
                      aria-expanded={open}
                      onClick={onToggleDetails}
                      className="inline-flex min-h-11 shrink-0 -my-2 items-center gap-0.5 py-2 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground md:my-0 md:min-h-0 md:py-0"
                    >
                      <span>{open ? t("line.collapse") : t("line.expand")}</span>
                      <span aria-hidden>{open ? "▴" : "▾"}</span>
                    </button>
                    <span aria-hidden className="mb-1 h-3 w-px shrink-0 bg-border" />
                  </>
                )}
                <button
                  type="button"
                  data-testid="cart-unpaint"
                  onClick={onUnpaint}
                  className="flex min-h-11 shrink-0 -my-2 items-center gap-1 py-2 text-[11px] text-muted-foreground hover:text-foreground md:my-0 md:min-h-0 md:py-0"
                >
                  <Eraser className="size-3" aria-hidden />
                  {t("unpaint.action")}
                </button>
                <span aria-hidden className="mb-1 h-3 w-px shrink-0 bg-border" />
                {/* Icon-only, per the mockup (`BRow`'s trash button carries no
                    label) — the accessible name moves to `aria-label`/`title`
                    instead. `-my-2 py-2 min-h-11` (a 44px tap target) only
                    below `md`; above it, the icon has no text of its own to
                    keep pace with, so that padding just leaves the button's
                    box ending below where the text beside it does — hence
                    the `md:` reset, not a "leave the padding, just look
                    past it" fix. `data-remove="line"` — see the sibling
                    "Remove all" button below: `cart-remove` is on both, one
                    row's trash and the other's text button, and a mixed
                    cart has both kinds of row at once. Not a rename
                    (`cart.spec` and the drawer both already read
                    `cart-remove`); a second attribute a locator can
                    additionally filter on.

                    Fix round 6 (card §4-quater) — below `md` this is the
                    only way to remove a line once the step-3 column is gone
                    (PR 2), and the icon-only box is 44px tall but only
                    ~20px wide (`px-1` around a `size-3` icon). Widened the
                    HIT AREA, not the button: `relative` + an absolutely
                    positioned `after:` at a negative `inset-x` (the
                    `CLOSE_DISC` idiom, `close-disc.ts`) grows it to 44×44 —
                    `after:inset-y-0` stretches it to the button's own
                    (already-44-below-`md`) height instead of guessing a
                    number that would drift if that height ever changes.
                    Padding or `width` would have re-widened the visible
                    button and pushed `cart-unpaint` — exactly the flush
                    alignment AC 8 just closed. Checked, not assumed: the
                    expanded hit box's left edge (12px past the button's own
                    left) still sits 13px clear of `cart-unpaint`'s own
                    right edge — no overlap (numbers in the task-2 report). */}
                <button
                  type="button"
                  data-testid="cart-remove"
                  data-remove="line"
                  onClick={onRemove}
                  aria-label={t("remove")}
                  title={t("remove")}
                  className="relative flex min-h-11 shrink-0 -my-2 items-center px-1 py-2 text-muted-foreground after:absolute after:inset-y-0 after:-inset-x-3 after:content-[''] hover:text-foreground md:my-0 md:min-h-0 md:py-0"
                >
                  <Trash2 className="size-3" aria-hidden />
                </button>
              </span>
            </>
          )}
        </div>
      </div>
      {/* Task 10 — the row picker (mockup `Line(r)`'s `picker?` block):
          every saved palette as a wrapping row of pills, dim+disabled for
          another design's (card §6). Gated on `paintTarget.kind==="palette"`
          too (task 2): the "none" target hides the picker entirely — there's
          nothing here for it to open. `h-11 lg:h-8`: a 44px touch target
          through the 768 rail the row's other controls already treat as
          mobile-narrow, the mockup's own `h-8` only from `lg` (1024px). */}
      {unpainted && paintTarget.kind === "palette" && pickerOpen && (
        <div
          id={pickerPanelId}
          role="group"
          aria-label={t("unpainted.pickerLabel")}
          className="mt-1.5 flex flex-wrap items-center gap-1.5"
        >
          {/* Card §4-bis (added mid-PR): current design's own palettes
              lead, the rest trail dimmed — same stable sort as the bar's
              chips, not a filter (a dim pill stays tappable: the tap
              switches the row to that palette's whole saved snapshot). */}
          {sortCurrentDesignFirst(palettes, currentDesignSlug).map((p) => {
            const dim = p.designSlug !== currentDesignSlug;
            // R5-TEXT-CARRY: exact, not stripped — the row's own thumb code
            // IS a saved code (or nothing matches): picking a pill adopts
            // that pill's whole saved snapshot, so the ring belongs to the
            // palette the row will really paint with, dedication included.
            // A dim pill is another design's whole snapshot now — it can
            // still become the row's paint, so `active` must not exclude it.
            const active = p.code === currentThumb.code;
            return (
              <button
                key={p.code}
                type="button"
                data-testid="palette-pill"
                data-code={p.code}
                data-active={active || undefined}
                // R5-DESIGN-SWITCH AC4: a dim pill stays tappable — the pick
                // switches the row to the palette's whole saved snapshot
                // (colours AND dedication, `explicitPickThumb`), same as any
                // other pill.
                aria-pressed={active}
                onClick={() => onPickPalette(p.code)}
                className={cn(
                  // `min-h-11 lg:min-h-8`, not a fixed height: a dedication
                  // (R5-TEXT-IDENTITY) is a genuine second line, same "let
                  // it grow" fix `PaletteChip`'s own tile needed.
                  "flex min-h-11 min-w-0 shrink-0 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-xs lg:min-h-8",
                  // No faded/unselectable state: every palette is always
                  // available, the tap just switches design too (`dim`
                  // only decides the subtitle below).
                  active
                    ? "bg-card font-semibold shadow-[0_0_0_1.5px_var(--ring)]"
                    : "bg-muted hover:bg-secondary"
                )}
              >
                <DesignRound layers={p.layers} className="size-6 shrink-0 rounded-sm" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="max-w-[108px] truncate">{p.name}</span>
                  {/* A dim pill (another design's) carries that design's own
                      name too, same as the palette bar's chips. The ACTIVE
                      pill is this ROW's own words right now (`currentThumb.
                      dedication` — an explicit pick paints the picked
                      palette's whole snapshot, colours AND dedication, see
                      `explicitPickThumb` in basket-host.ts via `rowThumb`
                      in basket.tsx), NOT some other pill's stored ones:
                      picking a pill adopts its saved dedication, so the
                      active pill shows exactly what the row will paint with.
                      Every other (selectable, non-active) pill is purely
                      "a saved palette in a list" and keeps its own. */}
                  {dim ? (
                    <span className="max-w-[108px] truncate text-[10px] text-muted-foreground">
                      · {designLabel(p.snapshot, locale) ?? p.designSlug}
                    </span>
                  ) : (
                    <PaletteDedicationLine
                      text={active ? currentThumb.dedication : p.snapshot.customText}
                      position={(active ? currentThumb.textPosition : p.snapshot.textPosition) ?? "centre"}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Mockup `BRow`'s unpainted branch: its own line, not part of the
          actions row above (a painted line's expand/unpaint/remove live
          there instead — see that row's comment). Decision B7: this testid
          was `docked-remove`; renamed to `cart-remove`, which is what the
          drawer's own remove button was called and what `e2e/cart.spec.ts`
          reads. It is this file's alone now — `cart-menu.tsx` is down to the
          trigger and the sheet shell (task 5). Fix round 3 —
          `data-remove="all"` (the painted row's own trash carries
          `data-remove="line"`): both buttons keep the `cart-remove` testid
          on purpose (not a rename, see that button's own comment), but a
          mixed cart has a row of each kind on screen together, and a
          locator scoped no narrower than the drawer needs a second
          attribute to tell them apart. */}
      {unpainted && (
        <div className="mt-2">
          <button
            type="button"
            data-testid="cart-remove"
            data-remove="all"
            onClick={onRemove}
            className="flex min-h-11 -my-2 items-center gap-1 py-2 text-[11px] text-muted-foreground hover:text-foreground md:my-0 md:min-h-0 md:py-0"
          >
            <Trash2 className="size-3" aria-hidden />
            {t("unpainted.removeAll")}
          </button>
        </div>
      )}
      {/* Task 12 — step-3-only drilldown (mockup `open` block). `!unpainted`
          is belt-and-braces: the toggle button above never renders for an
          unpainted row, so `open` can't really be true here, but a line's
          id changes shape on paint/unpaint (see class comment) and this
          keeps the panel from ever reading a null `configSnapshot`.
          TODO:nb-review — cart.line.config / cart.line.price NO copy is
          new, unreviewed (same batch as unpainted.cta below).
          Task 18 (TL) — the code and «Edit design» that fix round 2 put
          here were the wrong home: this panel is the drilldown
          (Config/Ceramic/Price), the code + edit affordance is the CART
          DRAWER's job. It used to live there in the drawer's own recap;
          the drawer renders `<Basket>` now, so `basket.tsx` passes them back
          in as `detailSlot` — drawer only — and that is what the three e2e
          specs read.
          Outside the grid above on purpose: this panel is the next block in
          the stack, full width, not a third column. */}
      {open && !unpainted && line.configSnapshot && (
        <div
          data-testid="cart-line-detail"
          className="mt-2 grid grid-cols-[112px_1fr] gap-4 rounded-sm border border-primary/30 bg-card/60 p-3"
        >
          {/* Composed preview, same compositing as `CartLineThumb`
              (multiply-blend the recolour layers), at size-28 — this panel's
              own preview, not a reuse of a bigger one. */}
          <span
            aria-hidden
            className="relative block size-28 overflow-hidden rounded-md border border-border bg-[var(--mk-canvas)]"
          >
            {(line.layers ?? []).map((l, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- composited catalog art from storage
              <img
                key={`${l.src}-${i}`}
                src={l.src}
                alt=""
                className="absolute inset-0 size-full object-contain"
                style={l.recolor ? { mixBlendMode: "multiply" } : undefined}
              />
            ))}
          </span>

          <div className="flex min-w-0 flex-col gap-2">
            {colourVariant && (
              <span
                data-testid="colour-badge"
                data-variant={colourVariant}
                className="self-start rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {colourVariant === "custom" ? t("colourBadge.custom") : t("colourBadge.studio")}
              </span>
            )}

            <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-1.5 text-xs">
              {/* Task 10 — the mockup's `Palette` dt (name + a swatch per
                  colour, `cname()` there ↔ `s.option` here, the design's own
                  readable colour name — no separate name lookup needed).
                  Distinct from `line.config` below: this is the PALETTE
                  (human name + colours), that is the technical selection
                  breakdown (category: option). */}
              <dt className="text-muted-foreground">{t("line.palette")}</dt>
              <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold">{paletteName ?? "—"}</span>
                {line.configSnapshot.selections
                  .filter((s) => s.hex)
                  .map((s) => (
                    <span key={`pal-${s.label}`} className="flex items-center gap-1">
                      <span
                        aria-hidden
                        className="size-3 rounded-full border border-border"
                        style={{ background: s.hex ?? undefined }}
                      />
                      {s.option}
                    </span>
                  ))}
              </dd>

              <dt className="text-muted-foreground">{t("line.config")}</dt>
              <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold">
                  {formatSelections(line.configSnapshot.selections, locale)}
                </span>
                {line.configSnapshot.selections
                  .filter((s) => s.hex)
                  .map((s) => (
                    <span
                      key={s.label}
                      aria-hidden
                      data-testid="cart-line-config-dot"
                      className="size-3 rounded-full border border-border"
                      style={{ background: s.hex ?? undefined }}
                    />
                  ))}
              </dd>

              {/* Text position is card 6's — this row prints the inscription
                  alone, no position, until that card exists. */}
              {line.configSnapshot.customText && (
                <>
                  <dt className="text-muted-foreground">{t("line.customText")}</dt>
                  <dd className="min-w-0 font-medium">«{line.configSnapshot.customText}»</dd>
                </>
              )}

              <dt className="text-muted-foreground">{t("line.ceramic")}</dt>
              <dd className="flex flex-wrap items-center gap-1.5 font-medium">
                {locale === "no" ? line.productNameNo : line.productNameEn}
                <SetBadge count={line.pieces ?? 1} />
                <span className="text-muted-foreground">
                  · {t("line.pieces", { count: (line.pieces ?? 1) * line.quantity })}
                </span>
                {/* Fix round 2 (task 10 review) — AC 5 names the info line
                    AND the details for `sizeLabel`; the row (line ~204)
                    already had it, this panel didn't. */}
                {sizeLabel && <span className="text-muted-foreground">· {sizeLabel}</span>}
              </dd>

              <dt className="text-muted-foreground">{t("line.price")}</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums">
                  {formatMoney(money(line.unitPriceCents, line.currency), locale)} × {line.quantity}
                </span>
                {/* Discount tag: same `--discount` recipe as `CartLinePrice`
                    (cart-discount-row.tsx) — read for the colours, not
                    reinvented, per the card's own instruction; that file is
                    untouched. Only when the line is actually discounted. */}
                {d.pct > 0 && (
                  <span
                    data-testid="cart-line-details-discount"
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap"
                    style={{
                      backgroundColor: "color-mix(in oklab, var(--discount) 16%, white)",
                      color: "color-mix(in oklab, var(--discount), black 34%)",
                      border: "1px solid color-mix(in oklab, var(--discount) 38%, white)",
                    }}
                  >
                    {d.coveredQty < d.quantity
                      ? t("discount.badgeCapped", { pct: d.pct, qty: d.coveredQty })
                      : t("discount.badge", { pct: d.pct })}
                  </span>
                )}
              </dd>
            </dl>
          </div>

          {/* Task 5: drawer-only (the code + copy + «Edit design»). Spans the
              grid because it is a foot, not a second column. */}
          {detailSlot && (
            <div className="col-span-2 border-t border-border/50 pt-2.5">{detailSlot}</div>
          )}
        </div>
      )}
    </div>
  );
}
