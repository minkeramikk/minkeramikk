"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { Brush, Eraser, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DesignRound } from "@/components/ui-domain/design-round";
import { SetBadge } from "@/components/ui-domain/set-badge";
import { formatMoney, money } from "@/lib/money/money";
import { designLabel, type CartLayer, type CartLine } from "@/lib/cart/cart";
import { formatSelections } from "@/lib/configurator/readable-selections";
import { paletteFor, sortCurrentDesignFirst, type Palette } from "@/lib/palettes/palettes";
import type { LineDiscount } from "@/lib/discounts/discount";
import { cn } from "@/lib/utils";

/**
 * First selection colour of a line → colour-chip fallback for the row's own
 * thumb (and CartLineThumb's, elsewhere).
 * Moved here from ceramics-step.tsx (task 8): this row is now its only
 * caller — cart-menu.tsx (steps 1–2 drawer) keeps its own identical copy.
 * Exported (task 11): `UnpaintDialog`'s line card needs the exact same
 * fallback for the line it is unpainting — a second copy would drift.
 */
export function thumbHex(line: CartLine): string | undefined {
  return line.configSnapshot?.selections.find((s) => s.hex)?.hex ?? undefined;
}

/**
 * R5-BASKET-HOST task 2 — the step-3 basket row (DESIGN-SYSTEM §3.14),
 * redesigned as a plain vertical stack (no CSS grid) at every breakpoint:
 * a `flex` thumb+info block, then a full-width actions row below it, then
 * the picker/expand/details blocks in turn. Binding source: `BRow` in
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
 * The details panel below is a step-3-only drilldown (composed preview +
 * config + ceramic + price) — NOT `CartLineRecap`, which stays untouched
 * and legacy-only for the steps 1–2 drawer.
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
  /** R5-BASKET-HOST task 2 — fires on the whole 64×132 thumb button (a
   *  later task opens a photo viewer with it). Absent here: this call site
   *  (step 3) doesn't wire it up yet, so the thumb stays inert markup —
   *  no button, no `⤢` affordance — exactly as before this task. */
  onOpenPhoto?: () => void;
  /** R5-BASKET-HOST task 2 — `"palette"` is today's step-3 behaviour (picker
   *  + n/N + Paint, unchanged). `"none"` is the header drawer's step-1 case
   *  (a later task): there is no configuration on screen to paint with, so
   *  the chip goes dead (disabled, muted) and a link sends the customer to
   *  step 2 instead — Paint, the n/N stepper and the picker panel all hide. */
  paintTarget: { kind: "palette" } | { kind: "none"; href: string };
  /** R5-BASKET-HOST task 5 — one host-specific block at the foot of the
   *  details panel. The DRAWER puts the MK code, its copy button and «Edit
   *  design» there (task 18's ruling: those belong to the drawer, not to
   *  this step-3 drilldown); they used to ride on `CartLineRecap`, which the
   *  drawer rendered instead of this row. The column passes nothing and its
   *  panel is unchanged. */
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
      className="border-b border-border/60 py-3.5 last:border-0"
    >
      <div className="flex gap-3.5">
        {/* Task 2 — the 64+64 stacked thumb (mockup `BigThumb`, `mode="stack"`).
            A real `<button>` only once a later task wires `onOpenPhoto` up —
            until then this stays exactly the inert markup it always was, no
            `⤢` disc either (that affordance promises a click that isn't
            there yet). Do NOT reach for `CartLineThumb` here: its sizes and
            its `compact` flex-switch belong to the offers list, not this row. */}
        {onOpenPhoto ? (
          <button
            type="button"
            onClick={onOpenPhoto}
            aria-label={t("line.seePhotos")}
            className="group relative flex shrink-0 flex-col gap-1"
          >
            {bigThumb}
          </button>
        ) : (
          <div className="relative flex shrink-0 flex-col gap-1">{bigThumb}</div>
        )}

        {/* Task 2 — info column: name, then palette-or-unpainted line, then
            (painted only, per the mockup) the size/set-of-N line. `min-w-0`
            here and on every truncating child: the trap this row has already
            paid for twice — a nowrap flex item can't shrink below its own
            content width without it. */}
        <div className="min-w-0 flex-1">
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
      </div>

      {/* actions row — full width, below the thumb+info block, and (mockup
          `BRow`'s `!unp` branch) the ONE row for the qty stepper, expand,
          unpaint and remove on a painted line — not split across two rows. */}
      <div
        className={cn(
          "mt-3 flex min-w-0 items-center gap-2",
          // `flex-wrap`'s line-fit decision uses each item's hypothetical
          // (un-shrunk) size, not how far it *can* shrink — so an item needs
          // an actual cap (`max-width`, or a `0` flex-basis) to not be what
          // forces a wrap; `min-width` alone doesn't do it. Every item here
          // is capped: the chip's `0` flex-basis absorbs the slack, Paint's
          // label is `max-w`-capped, `cart-expand`'s label truncates
          // (`min-w-0`), and the stepper/unpaint/remove are fixed-width
          // (`shrink-0`) — nothing is left free to force the wrap. Resets at
          // `lg` (1024px) not `md`: at 768 the rail (`ceramics-step.tsx`'s
          // `md:grid-cols-2`) is only ~350px, still too narrow for this
          // row's full desktop sizing.
          "flex-wrap lg:flex-nowrap lg:gap-1.5"
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
                // `lg:flex-initial`, NOT `lg:flex-none`: `flex-none` has no
                // shrink, so a long `formatSelections` label can't truncate
                // and pushes Paint out of the panel — `flex-initial` keeps
                // the shrink permission the label's `truncate` needs.
                className={cn(
                  "flex h-11 min-w-0 flex-1 items-center gap-1 rounded-sm border bg-card pl-1 pr-1 text-xs font-medium sm:h-9 lg:flex-initial lg:gap-1.5 lg:pr-2",
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
                <span className="min-w-0 truncate">{currentThumb.label}</span>
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
                // can give ground before the icon/badge do. `lg:min-w-max`
                // resets that shrink permission at `lg`, same gate as the
                // chip's.
                className="relative ml-auto flex h-11 min-w-0 items-center gap-1 rounded-sm bg-primary px-2 text-xs font-semibold text-primary-foreground sm:h-9 lg:min-w-max lg:gap-1.5 lg:px-3.5"
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
            {/* Mockup `BRow`'s `!unp` branch: expand + unpaint + remove live
                on this same row (`ml-auto` on the last pair), not a second
                row below — a painted legacy line has no `configSnapshot`,
                so the expand toggle (which needs one to open) skips it. */}
            {line.configSnapshot && (
              // `min-w-0` on the button + `truncate` on its label: the one
              // item here allowed to give ground — «Vis detaljer»/«Show
              // details» can lose characters without losing meaning, unlike
              // the single unbreakable words beside it. The ▾/▴ stays
              // `shrink-0` so the click target and the state glyph survive.
              <button
                type="button"
                data-testid="cart-expand"
                aria-expanded={open}
                onClick={onToggleDetails}
                className="inline-flex min-h-11 min-w-0 -my-2 items-center gap-0.5 py-2 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground md:my-0 md:min-h-0 md:py-0"
              >
                <span className="min-w-0 truncate">{open ? t("line.collapse") : t("line.expand")}</span>
                <span aria-hidden className="shrink-0">{open ? "▴" : "▾"}</span>
              </button>
            )}
            <span className="ml-auto flex items-center gap-3">
              <button
                type="button"
                data-testid="cart-unpaint"
                onClick={onUnpaint}
                className="flex min-h-11 shrink-0 -my-2 items-center gap-1 py-2 text-[11px] text-muted-foreground hover:text-foreground md:my-0 md:min-h-0 md:py-0"
              >
                <Eraser className="size-3" aria-hidden />
                {t("unpaint.action")}
              </button>
              {/* Icon-only, per the mockup (`BRow`'s trash button carries no
                  label) — this is also the widest thing this row could
                  carry in its tightest spot, so the accessible name moves
                  to `aria-label`/`title` instead of visible text. */}
              <button
                type="button"
                data-testid="cart-remove"
                onClick={onRemove}
                aria-label={t("remove")}
                title={t("remove")}
                className="flex min-h-11 shrink-0 -my-2 items-center px-1 py-2 text-muted-foreground hover:text-foreground md:my-0 md:min-h-0 md:py-0"
              >
                <Trash2 className="size-3" aria-hidden />
              </button>
            </span>
          </>
        )}
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
                {/* A dim pill (another design's) carries that design's own
                    name too, same as the palette bar's chips. */}
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

      {/* Mockup `BRow`'s unpainted branch: its own line, not part of the
          actions row above (a painted line's expand/unpaint/remove live
          there instead — see that row's comment). Decision B7: this testid
          was `docked-remove`; renamed to `cart-remove` to match the one
          other place it's used (`e2e/cart.spec.ts`, `cart-menu.tsx`). */}
      {unpainted && (
        <div className="mt-2">
          <button
            type="button"
            data-testid="cart-remove"
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
          here were the wrong home: this panel is a step-3-only drilldown
          (Config/Ceramic/Price), the code + edit affordance is the CART
          DRAWER's job and already lives there via `CartLineRecap`
          (cart-menu.tsx) — the three e2e specs that used to read them off
          this panel now read them off the drawer instead.
          No longer `col-span-2 md:col-span-3` (task 2 dropped the grid):
          this panel is now just the next block in the stack. */}
      {open && !unpainted && line.configSnapshot && (
        <div
          data-testid="cart-line-detail"
          className="mt-2 grid grid-cols-[112px_1fr] gap-4 rounded-sm border border-primary/30 bg-card/60 p-3"
        >
          {/* Composed preview, same compositing as CartLineThumb/CartLineRecap
              (multiply-blend the recolour layers), size-28 — this card's own
              preview, not a reuse of CartLineRecap's size-52. */}
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
