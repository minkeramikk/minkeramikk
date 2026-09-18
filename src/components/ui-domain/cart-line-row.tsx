"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { Brush, Eraser, Trash2 } from "lucide-react";
import { CartLineThumb } from "@/components/ui-domain/cart-line-thumb";
import { DesignRound } from "@/components/ui-domain/design-round";
import { SetBadge } from "@/components/ui-domain/set-badge";
import { formatMoney, money } from "@/lib/money/money";
import { designLabel, type CartLayer, type CartLine } from "@/lib/cart/cart";
import { formatSelections } from "@/lib/configurator/readable-selections";
import { paletteFor, sortCurrentDesignFirst, type Palette } from "@/lib/palettes/palettes";
import type { LineDiscount } from "@/lib/discounts/discount";
import { cn } from "@/lib/utils";

/**
 * First selection colour of a line → colour-chip fallback for CartLineThumb.
 * Moved here from ceramics-step.tsx (task 8): this row is now its only
 * caller — cart-menu.tsx (steps 1–2 drawer) keeps its own identical copy.
 * Exported (task 11): `UnpaintDialog`'s line card needs the exact same
 * fallback for the line it is unpainting — a second copy would drift.
 */
export function thumbHex(line: CartLine): string | undefined {
  return line.configSnapshot?.selections.find((s) => s.hex)?.hex ?? undefined;
}

/**
 * R5-UNPAINTED task 8 — the step-3 basket row (DESIGN-SYSTEM §3.14), rebuilt
 * as a grid around a line that may carry no colours (`configCode: null`).
 * Binding source: docs/revision5/mockup-palettebar.html, `Line(r)` («Step 3 ·
 * opzione A») — the icons on the Unpaint/Remove actions follow the mockup's
 * `Ico.unpaint`/`Ico.trash` glyphs (lucide `Eraser`/`Trash2` here; the task
 * brief's own "1:1" markup had dropped them, so the mockup wins per the card's
 * own tie-break rule).
 *
 * Owns NO state: `open`/`onToggleDetails` and every mutation arrive as props
 * — task 10's "how many to paint" number (`n`) is no exception, it lives in
 * the parent's `Record<lineId, number>` (mirrors the mockup's `S3.n[id]`) and
 * arrives here as `n`/`onN`, so this stays a pure render of whatever the
 * parent's cart state is right now.
 *
 * Task 12 fills the last gap: the details panel below, a step-3-only
 * drilldown (composed preview + config + ceramic + price) — NOT
 * `CartLineRecap`, which stays untouched and legacy-only for the steps 1–2
 * drawer (mockup `Line(r)`'s `open` block, `docs/revision5/mockup-palettebar.html`).
 */
/**
 * The line's colours as dots. TL, 18/9: on the row the dots ARE the colours —
 * spelling the names out next to them only bought a truncation («Amalfi Dyr NO
 * ●●●● · Esel · Verde…»). The names live one tap away, in the details panel.
 */
function Dots({ hexes }: { hexes: string[] }) {
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
  currentThumb: { layers: CartLayer[]; label: string; hexes: string[]; code: string };
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
}) {
  // TODO:nb-review — cart.unpainted.* / cart.unpaint.action NO copy is new,
  // unreviewed (mirrors cart.buttonUnpainted's own "umalt/umalte" wording).
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
  /** Does the thumb column hold two images (design over ceramic), or just one? */
  const hasPlate = Boolean(line.plateImage);
  const isSet = (line.pieces ?? 1) > 1;
  // R5-PALETTES §4-bis: locale-picked like productNameNo/En — undefined on a
  // legacy line, and the info line below prints nothing for it (AC 5).
  const sizeLabel = locale === "no" ? line.sizeLabelNo : line.sizeLabelEn;
  // Fix round 2 (blocker 1) — same colour-source rule as the retired
  // `CartLineRecap`: `customNote` is present (possibly "") only when the
  // design takes notes; non-empty ⇒ custom colours, "" ⇒ studio's, absent ⇒
  // no badge.
  const note = line.configSnapshot?.customNote;
  const colourVariant = note === undefined ? null : note.trim() ? "custom" : "studio";
  // R5-PALETTES task 10 — a painted row is named by the palette it was
  // painted WITH (read from the store by the line's own frozen `configCode`),
  // not the design: two rows of the same design can carry different
  // palettes, and the design name no longer disambiguates them. Falls back
  // to the design name when the code isn't (or is no longer, LRU eviction)
  // a saved palette — e.g. every line painted before R5-PALETTES existed.
  const paletteName = !unpainted && line.configCode
    ? (paletteFor(palettes, line.configCode)?.name ?? designLabel(line.configSnapshot, locale) ?? null)
    : null;

  return (
    <div
      data-testid="cart-line"
      data-unpainted={unpainted || undefined}
      className="border-b border-border/60 py-3 last:border-0"
    >
      {/* Task 14 — mobile row (DESIGN-SYSTEM §3.19: breakpoint classes, never
          a JS media query). Binding source: docs/revision5/mockup-palettebar.html,
          `MobLine(r)` («Step 3 · mobile»). Two columns under `md` (thumb +
          body), three from `md` (thumb + body + price) — the price block
          below is rendered ONCE and reparented with `md:contents`: at mobile
          the wrapping div is a flex row (title beside price), at `md` it
          stops generating its own box so its two children become direct
          grid items and fall into the desktop grid's auto-placed 2nd/3rd
          columns. A second, duplicated price node would be read twice by a
          screen reader — this is the one-node alternative. */}
      {/* `minmax(0,1fr)`, not `1fr`: a bare `1fr` is `minmax(auto,1fr)`, so the
          track refuses to go below its content's min-content width — and the
          actions row's content (chip + stepper + Paint) is wider than the rail
          on a design whose `formatSelections` runs long. The column then grew
          PAST the panel and pushed Paint off screen, while the chip's own
          `flex-1` never engaged: the flex container it shrinks against was
          already oversized. Real cart, reported from the running app. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 md:grid-cols-[auto_minmax(0,1fr)_auto]">
        {/* The thumb column holds TWO images stacked (design over ceramic) only
            when the line carries a ceramic photo; without one it is a single
            48px square and the space under it is dead. So it spans both rows
            only when there is something in the second one — see the actions
            row below, which claims that space when there is not. */}
        <div className={cn(hasPlate && "row-span-2")}>
          <CartLineThumb
            unpainted={unpainted}
            layers={unpainted ? currentThumb.layers : line.layers}
            hex={thumbHex(line)}
            plateImage={line.plateImage}
          />
        </div>
        <div className="flex min-w-0 items-start justify-between gap-2 md:contents">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-medium leading-tight">
              {/* `min-w-0`: same bug class the chip caught with a long
                  `formatSelections` — a nowrap flex item's `truncate`
                  can't shrink below its own content width without it. The
                  product name is DB text, not bounded by anything upstream. */}
              <span className="min-w-0 truncate">
                {locale === "no" ? line.productNameNo : line.productNameEn}
              </span>
              {/* F29: legacy lines lack `pieces` → SetBadge renders nothing */}
              <SetBadge count={line.pieces ?? 1} className="shrink-0" />
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              {unpainted ? (
                <>
                  <span className="text-warn-on-light">○ {t("unpainted.label")}</span>
                  {" · "}
                  {/* Fix round 2 (finding 7): the mockup prints the LINE's own
                      quantity, not physical pieces — a set-of-3 ×2 line is "2
                      sets", not "6 pieces". Same unit vocabulary as the unpaint
                      dialog, not a third one. */}
                  {line.quantity}{" "}
                  {t(isSet ? "unpaintDialog.unitSet" : "unpaintDialog.unitPiece", {
                    count: line.quantity,
                  })}
                </>
              ) : (
                <>
                  {/* Fix round 1 / task 8: the mockup's Line(r) puts a mini
                      design preview + a colour dot per selection here (Thumb +
                      Dots) — a legacy line without `layers` skips the preview,
                      same fallback CartLineThumb already uses. */}
                  {line.layers && line.layers.length > 0 && (
                    <DesignRound layers={line.layers} className="size-4 rounded-sm" />
                  )}
                  {/* TL, 18/9: with the colour NAMES gone (see Dots), the name
                      has the line to itself and only truncates when it is
                      genuinely too long for the column. Task 10: the PALETTE's
                      name now, not the design's — see `paletteName` above. */}
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {paletteName ?? "—"}
                  </span>
                  <Dots
                    hexes={(line.configSnapshot?.selections ?? [])
                      .map((sel) => sel.hex)
                      .filter((hex): hex is string => Boolean(hex))}
                  />
                  {/* R5-PALETTES §4-bis (mockup "· Ø 26 cm"): a PAIR, read by
                      locale like every other bilingual field on the line —
                      absent on a line saved before this field existed, so no
                      stray "·" prints for it (AC 5). */}
                  {sizeLabel && <span className="shrink-0">· {sizeLabel}</span>}
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <span data-testid="cart-line-net" className="text-sm font-semibold tabular-nums">
              {formatMoney(d.net, locale)}
            </span>
            {d.pct > 0 && (
              <s
                data-testid="cart-line-full"
                aria-hidden
                className="text-[11px] tabular-nums text-muted-foreground"
              >
                {formatMoney(d.full, locale)}
              </s>
            )}
          </div>
        </div>

        {/* actions row — the unpainted case is the n/N paint selector plus
            the palette picker chip (task 10, mockup `Line(r)`'s `onclick=
            "tog('pick',…)"` button). Under
            `md` it auto-places into the body column (mockup `MobLine` gives
            it no col-* class at all — the thumb's own `row-span-2` already
            keeps col 1 out of reach); from `md` it explicitly spans the two
            right-hand columns, same as the pre-mobile layout. */}
        <div
          className={cn(
            "flex min-w-0 items-end",
            hasPlate
              ? "md:col-start-2 md:col-span-2"
              : // No ceramic photo → nothing sits under the thumb, so the row
                // starts at the left edge and takes the whole width. On a
                // narrow phone that is 60px the chip did not have before.
                "col-start-1 col-span-2 md:col-span-3"
          )}
        >
          {/* Fit at 375 AND 390, in BOTH locales — not just 390/no, which
              happened to have 4px of slack while 390/en (295px needed) and
              375/either (275px available) genuinely wrapped. The fix is
              SHRINKING, not wrapping: the chip (its own comment, below) is
              `flex-1 min-w-0` with no cap at all, so it always absorbs
              whatever the stepper and Paint (their own intrinsic sizes)
              leave behind, and Paint's own label carries a defensive
              `max-width` so IT can't be the thing that forces a wrap
              either — a `max-width` (or a `0` flex-basis, the chip's own
              trick) is what actually bounds an item's size for
              `flex-wrap`'s line-fit decision (it uses each item's
              hypothetical/un-shrunk size to decide breaks; `min-width`
              alone, which Paint also carries, only sets how far it can
              shrink AFTER it's already on a line — it does nothing for the
              fit decision by itself, which is why min-w-0 alone didn't fix
              this originally). Between the chip absorbing the slack and
              Paint's own cap, the row's real content fits at every
              width/locale combo this card supports, so `flex-wrap` stays a
              genuine last resort — dormant today, not the everyday path —
              rather than deleted outright.

              Every trim on this row resets at `lg` (1024px), not `md`
              (768px): `ceramics-step.tsx`'s own two-column layout
              (`md:grid-cols-2`) makes the desktop rail a 50/50 split of the
              viewport, so at exactly 768 the rail is ~350px wide — narrower
              than the row needs for PR 2's full desktop sizing (chip +
              stepper + Paint at their natural widths measured ~306px
              against a ~248px actions column, a real page overflow caught
              by testing 768 specifically, not 1280 alone). The row stays in
              its mobile-safe, shrink-first mode through the whole 768-1023
              range and only takes PR 2's own numbers back at 1024+, where
              the rail is comfortably wide again. */}
          <div className="flex w-full flex-wrap items-center gap-1 pt-2 lg:flex-nowrap lg:gap-1.5">
            {unpainted ? (
              <>
                <button
                  ref={pickerToggleRef}
                  type="button"
                  data-testid="paint-chip"
                  data-code={currentThumb.code}
                  disabled={!hasPalettes}
                  aria-expanded={hasPalettes ? pickerOpen : undefined}
                  // Finding 5 (minor) — an id only meaningful while the panel
                  // it names actually exists; pointing at it while closed
                  // described a node that wasn't there.
                  aria-controls={hasPalettes && pickerOpen ? pickerPanelId : undefined}
                  onClick={hasPalettes ? onTogglePicker : undefined}
                  // `flex-1 min-w-0`: no fixed cap on the label (a magic
                  // number like 32px is a stub, not a label, once the
                  // thumb+icon already carry the colour meaning) — instead
                  // the chip's own `flex-basis` is 0, so it contributes ~0
                  // to `flex-wrap`'s line-fit decision (that decision uses
                  // each item's hypothetical/un-shrunk size; a `0` basis is
                  // the smallest possible one) and it can never be the
                  // reason the row wraps. It then grows to fill whatever
                  // the stepper and Paint (both sized to their own
                  // intrinsic widths, `flex-grow: 0`) leave behind — more
                  // room at 390 than 375, more in /no/ than /en/ (Paint's
                  // own footprint is wider there).
                  //
                  // `lg:flex-initial` (`flex: 0 1 auto`, NOT `lg:flex-none`
                  // — a real cart caught this: `flex-none` is `flex: 0 0
                  // 0 auto`, no shrink, so a design with many categories
                  // (`formatSelections` can read like "Svane / Swan ·
                  // Celeste · Verde Ramina Carico · Giallo · Arancio
                  // Vietri · No color") rendered at its full intrinsic
                  // width and pushed Paint clean out of the panel —
                  // `truncate` on the label can't help an item that never
                  // shrinks, it has no width to truncate against). Grow
                  // still stays 0, so the chip never stretches across the
                  // rail at 1024+ the way it does below `lg`; it just
                  // takes its natural width when there's room and
                  // truncates (via `min-w-0` + the label's own `truncate`,
                  // same mechanism as the mobile side) when there isn't —
                  // matching every other reset on this row, which stays
                  // `lg`-gated, not `md` (see the row comment above).
                  className={cn(
                    "flex h-11 min-w-0 flex-1 items-center gap-1 rounded-sm border bg-card pl-1 pr-1 text-xs font-medium sm:h-9 lg:flex-initial lg:gap-1.5 lg:pr-2",
                    // Finding 5 (minor) — the mockup's OPEN trigger carries
                    // `border-primary shadow-[0_0_0_1px_var(--ring)]`, not
                    // just a glyph flip; this had dropped the border/ring half.
                    pickerOpen
                      ? "border-primary shadow-[0_0_0_1px_var(--ring)]"
                      : "border-border",
                    !hasPalettes && "disabled:cursor-not-allowed"
                  )}
                >
                  <DesignRound layers={currentThumb.layers} className="size-6 shrink-0 rounded-sm" />
                  {/* Dots first, then the name — same order as the painted
                      row's info line, at every width (TL, 18/9: the name is
                      information worth having on a phone too, even truncated).
                      The dots keep their fixed width and the name takes what
                      is left, so the chip still shrinks instead of pushing
                      Paint out. */}
                  <Dots hexes={currentThumb.hexes} />
                  <span className="min-w-0 truncate">{currentThumb.label}</span>
                  {/* Task 10 — the mockup's `▾`/`▴` (`picker?'▴':'▾'`); `shrink-0`
                      so a long palette name truncates before this ever gives
                      ground, same rule as the dots beside it. Finding 2: no
                      glyph at all when there's nothing to pick. */}
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
                  // `min-w-0`: removes the button's default content-based
                  // minimum, so it CAN shrink below its label's full width —
                  // paired with the label's own `max-w`/`truncate` below,
                  // which is what actually matters for the flex-wrap
                  // line-fit decision (a `max-width` bounds an item's
                  // hypothetical size for that decision; `min-width` alone
                  // does not — see the chip's own comment above for the
                  // width budget this and the chip cap were sized against).
                  // The brush icon (`shrink-0`) and the paint-count badge
                  // always survive; only the word can give ground.
                  // `lg:min-w-max` resets the shrink-permission itself, not
                  // just the padding — and resets at `lg` (1024px), same as
                  // the row's other trims (see the row comment above): at
                  // 768 the desktop rail (`ceramics-step.tsx`'s own
                  // `md:grid-cols-2`, a 50/50 split) is only ~350px wide,
                  // too narrow for chip + stepper + Paint at PR 2's full
                  // desktop sizing (~306px needed against a measured ~248px
                  // actions column) — resetting this at `md` instead of
                  // `lg` was tried first and produced a real page overflow
                  // at 768, caught by testing that width specifically
                  // rather than trusting 1280 to stand in for "desktop".
                  className="relative ml-auto flex h-11 min-w-0 items-center gap-1 rounded-sm bg-primary px-2 text-xs font-semibold text-primary-foreground sm:h-9 lg:min-w-max lg:gap-1.5 lg:px-3.5"
                >
                  <Brush className="size-3.5 shrink-0" aria-hidden />
                  <span className="max-w-[52px] truncate">{t("unpainted.paint")}</span>
                  {/* TL change (fix round 1): badge reads from 2 upward, not
                      only the partial case — a 2-piece row at its default 2/2
                      showed NO badge before and only grew one after a −
                      press. Any row with more than one unit to choose from
                      always carries its current n; a single-unit row (n is
                      always 1 of 1, nothing to choose) still shows none. This
                      is a deliberate divergence from the mockup, which only
                      badges the partial case. */}
                  {/* Always, not only on a partial selection: the badge is the
                      count Paint is about to act on, and «1» is as much an
                      answer as «2». TL, from the running app. */}
                  {(
                    <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-ink text-[10px] font-bold text-ink-foreground shadow">
                      {n}
                    </span>
                  )}
                </button>
              </>
            ) : (
              <div
                role="group"
                aria-label={t("quantity")}
                className="flex h-11 items-center rounded-sm border border-border bg-card sm:h-9"
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
            )}
          </div>
        </div>

        {/* Task 10 — the row picker (mockup `Line(r)`'s `picker?` block):
            every saved palette as a wrapping row of pills, dim+disabled for
            another design's (card §6). Same explicit `col-span-2 md:col-span-3`
            as the full-bleed row below, not the actions row's hasPlate-
            conditional placement above — this panel isn't chasing the chip's
            own column, it's a full-width drop-down under it, and reusing the
            proven-safe full-bleed geometry (already verified not to overflow
            at 375/390/768/1280) sidesteps the auto-placement risk a THIRD
            sibling with no explicit column would otherwise hit once the
            thumb's `row-span-2` no longer reaches this far down. `h-11
            lg:h-8`: a 44px touch target through the 768 rail the row's other
            controls already treat as mobile-narrow (see the row comment
            above), the mockup's own `h-8` only from `lg` (1024px). */}
        {unpainted && pickerOpen && (
          <div
            id={pickerPanelId}
            role="group"
            aria-label={t("unpainted.pickerLabel")}
            className="col-span-2 mt-1.5 flex flex-wrap items-center gap-1.5 md:col-span-3"
          >
            {/* Card §4-bis (added mid-PR): current design's own palettes
                lead, the rest trail dimmed — same stable sort as the bar's
                chips, not a filter (a dim pill stays reachable, just inert). */}
            {sortCurrentDesignFirst(palettes, currentDesignSlug).map((p) => {
              const dim = p.designSlug !== currentDesignSlug;
              const active = p.code === currentThumb.code;
              return (
                <button
                  key={p.code}
                  type="button"
                  data-testid="palette-pill"
                  data-code={p.code}
                  data-active={active || undefined}
                  disabled={dim}
                  aria-pressed={active}
                  onClick={() => onPickPalette(p.code)}
                  className={cn(
                    "flex h-11 min-w-0 shrink-0 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-xs lg:h-8",
                    dim
                      ? "bg-muted text-muted-foreground opacity-45"
                      : active
                        ? "bg-card font-semibold shadow-[0_0_0_1.5px_var(--ring)]"
                        : "bg-muted hover:bg-secondary"
                  )}
                >
                  <DesignRound layers={p.layers} className="size-6 shrink-0 rounded-sm" />
                  <span className="max-w-[108px] truncate">{p.name}</span>
                  {/* Finding 5 (minor) — the mockup's dim pill carries the
                      other design's name ("· Limoni"); the chips already do
                      this (dimDesignName), the pills hadn't caught up. */}
                  {dim && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      · {designLabel(p.snapshot, locale) ?? p.designSlug}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* full-bleed row, under the thumb too — matches mockup MobLine's
            `col-span-2` (mobile) / Line's `col-span-3` (desktop), same
            treatment as the actions row above but reaching col 1 as well. */}
        <div className="col-span-2 mt-1.5 flex items-center justify-between text-[11px] md:col-span-3">
          {/* Fix round 2 (finding 9): a painted LEGACY line has no
              `configSnapshot` — the details panel below never renders one,
              so the toggle must not promise it either. */}
          {!unpainted && line.configSnapshot ? (
            <button
              type="button"
              data-testid="cart-expand"
              aria-expanded={open}
              onClick={onToggleDetails}
              // `min-h-11 -my-2 py-2`: this row came in at PR 2 as a bare
              // text-[11px] button (~16px hit area) — a real 44px tap
              // target under `md`, without moving the visible baseline: the
              // negative margin gives the extra height back to the
              // surrounding flow, and `md:` resets to PR 2's own rhythm.
              className="inline-flex min-h-11 -my-2 items-center py-2 text-muted-foreground underline underline-offset-2 hover:text-foreground md:my-0 md:min-h-0 md:py-0"
            >
              {open ? `${t("line.collapse")} ▴` : `${t("line.expand")} ▾`}
            </button>
          ) : (
            <span />
          )}
          <span className="flex items-center gap-3">
            {!unpainted && (
              <button
                type="button"
                data-testid="cart-unpaint"
                onClick={onUnpaint}
                className="flex min-h-11 -my-2 items-center gap-1 py-2 text-muted-foreground hover:text-foreground md:my-0 md:min-h-0 md:py-0"
              >
                <Eraser className="size-3" aria-hidden />
                {t("unpaint.action")}
              </button>
            )}
            <button
              type="button"
              data-testid="docked-remove"
              onClick={onRemove}
              className="flex min-h-11 -my-2 items-center gap-1 py-2 text-muted-foreground hover:text-foreground md:my-0 md:min-h-0 md:py-0"
            >
              <Trash2 className="size-3" aria-hidden />
              {unpainted ? t("unpainted.removeAll") : t("remove")}
            </button>
          </span>
        </div>
        {/* Task 12 — step-3-only drilldown (mockup `open` block). `!unpainted`
            is belt-and-braces: the toggle button above never renders for an
            unpainted row, so `open` can't really be true here, but a line's
            id changes shape on paint/unpaint (see class comment) and this
            keeps the panel from ever reading a null `configSnapshot`.
            TODO:nb-review — cart.line.config / cart.line.price NO copy is
            new, unreviewed (same batch as unpainted.cta below).
            Fix round 2 (blocker 1) — `cart-line-detail` (singular) is the
            SAME testid the retired `CartLineRecap` used, in the mockup's own
            `dl` idiom rather than a `CartLineRecap` re-import.
            Task 18 (TL) — the code and «Edit design» that fix round 2 put
            here were the wrong home: this panel is a step-3-only drilldown
            (Config/Ceramic/Price), the code + edit affordance is the CART
            DRAWER's job and already lives there via `CartLineRecap`
            (cart-menu.tsx) — the three e2e specs that used to read them off
            this panel now read them off the drawer instead. */}
        {open && !unpainted && line.configSnapshot && (
          <div
            data-testid="cart-line-detail"
            className="col-span-2 mt-2 grid grid-cols-[112px_1fr] gap-4 rounded-sm border border-primary/30 bg-card/60 p-3 md:col-span-3"
          >
            {/* Composed preview, same compositing as CartLineThumb/CartLineRecap
                (multiply-blend the recolour layers) at the mockup's size-28 —
                this card's own preview, not a reuse of CartLineRecap's size-52. */}
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
          </div>
        )}
      </div>
    </div>
  );
}
