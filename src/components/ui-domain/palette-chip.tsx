"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { DesignRound } from "@/components/ui-domain/design-round";
import { deleteTap, disarm } from "@/components/ui-domain/delete-confirm";
import type { CartLayer } from "@/lib/cart/cart";
import type { TextPosition } from "@/lib/configurator/text-position";
import { cn } from "@/lib/utils";

/**
 * R5-PALETTES task 6 — the mockup's `Chip` (`docs/revision5/mockup-palettebar.html`,
 * `function Chip(...)`), as a real component. Presentational only: every state is a
 * prop, every action a callback, no store access. The only state this owns is the
 * rename draft string while its own `renaming` prop is true (mirrors the mockup's
 * single extra piece of local state, the `<input>` value).
 *
 * The mockup renders one `<button>` with a decorative `<span title="Rename">✎</span>`
 * inside it, and swaps the label for a bare `<input>` when `rename` is set — both
 * invalid here: a real `<input>` can't sit inside a `<button>` (nested interactive
 * content), and a hover-only `<span>` isn't keyboard-reachable (brief requirement).
 * So the outer element is a plain `<div>` carrying the mockup's chip classes, with
 * the SELECT action and the RENAME action as two sibling controls inside it — same
 * classes, same pixels, valid nesting.
 */
export interface PaletteChipProps {
  /** Config code — the palette's identity. Not shown; callers may use it as a key. */
  code: string;
  /** The palette's name — `nameFor()` or the customer's rename. Data, never translated. */
  name: string;
  /**
   * The customer's own words, shown as a second line in quotes —
   * `ConfigSnapshot.customText`, never decoded from `code`. This component
   * only renders it; it does NOT decide whose words they are. The CALLER
   * answers that, per chip: a chip flagged `active`/`draft` (this IS the
   * canvas right now) must pass the CURRENT field value, even when its
   * `name`/`layers`/`code` came from a colour-matched save — a dedication
   * is exactly the one thing NOT shared with that save. A plain list chip
   * (neither `active` nor `draft`) passes that palette's own stored value.
   * Getting the two swapped shows a customer someone else's words on what
   * looks like their own canvas (R5-TEXT-IDENTITY, TL ruling). Optional:
   * most palettes carry no dedication, and `dim` chips show `dimDesignName`
   * in this same slot instead (that takes priority — see the render below).
   */
  dedication?: string;
  /** Design pattern layers for the 36px composited thumb (same technique as the cart row). */
  layers: CartLayer[];
  /** This is the palette in use right now — bold surface, ring, `aria-current`. */
  active?: boolean;
  /** The current (unsaved) canvas colours — dashed border, «Unsaved» eyebrow over the name. */
  draft?: boolean;
  /** Belongs to another design than the one on screen — same skin as any
   *  other chip (no faded/unselectable state: every palette is always
   *  available, the tap just switches design too). `dimDesignName` still
   *  shows as subtitle so the customer knows the tap changes design. */
  dim?: boolean;
  /** The OTHER design's name, shown as a subtitle — only rendered (and only meaningful) when `dim`. */
  dimDesignName?: string;
  /** Step 3, pure target: thumb 28, text 12.5, name at 96px — DS §3.31. */
  compact?: boolean;
  /** Parent-owned: this is the one chip currently in rename mode (only one at a time). */
  renaming?: boolean;
  /** Fires on click/Enter/Space of the chip body (not while `renaming`). */
  onSelect?: () => void;
  /** Fires when the ✎ affordance is activated — the parent flips `renaming` on for this chip. */
  onRenameStart?: () => void;
  /** Fires with the trimmed, non-empty new name on Enter or blur. */
  onRenameConfirm?: (name: string) => void;
  /** Fires on Escape, or on Enter/blur with an empty/unchanged draft. */
  onRenameCancel?: () => void;
  /**
   * Delete affordance (✕) — only meaningful for a SAVED palette: the caller
   * simply doesn't pass this for a `draft` chip (nothing to delete yet).
   * R5-POLISH-STEP23 T1: the chip confirms IN PLACE — first tap arms
   * (the ✕ becomes «Delete? Tap again», `// TODO:nb-review` on the NO copy),
   * second tap calls this. Blur/Escape disarm. The store still deletes
   * without asking (deletePalette.ts): the question lives in the UI only.
   */
  onDelete?: () => void;
}

export function PaletteChip({
  code,
  name,
  dedication,
  layers,
  active = false,
  draft = false,
  dim = false,
  dimDesignName,
  compact = false,
  renaming = false,
  onSelect,
  onRenameStart,
  onRenameConfirm,
  onRenameCancel,
  onDelete,
}: PaletteChipProps) {
  // TODO:nb-review — palettes.chip.* NO copy is new, unreviewed (no live-site source: R5-PALETTES).
  const t = useTranslations("palettes.chip");
  const inputId = useId();
  const [draftName, setDraftName] = useState(name);
  // Guards against a stray double-commit when Enter is followed by a blur
  // in the same interaction (e.g. the confirm handler moves focus away).
  const settledRef = useRef(false);

  // T1 — two-tap delete, local to this chip (see delete-confirm.ts).
  const [deleteArmed, setDeleteArmed] = useState(false);
  useEffect(() => {
    if (!active) setDeleteArmed(false); // leaving the active chip drops the question
  }, [active]);

  useEffect(() => {
    if (renaming) {
      setDraftName(name);
      settledRef.current = false;
    }
  }, [renaming, name]);

  // Fix wave B finding 4 — Enter/Esc unmount the `<input>` and there's no
  // Radix `onCloseAutoFocus` here to catch the fall (this is a plain
  // conditional render, not a dialog primitive): same restore-to-opener idea
  // as the unpaint dialog (DESIGN-SYSTEM §3.14), done by hand. Guarded on
  // `document.activeElement === document.body` so a blur that's really a Tab
  // to the NEXT control (focus already moved somewhere real) isn't overridden.
  const selectRef = useRef<HTMLButtonElement>(null);
  const wasRenaming = useRef(renaming);
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
    if (trimmed && trimmed !== name) onRenameConfirm?.(trimmed);
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

  const skin = active
    ? "bg-card font-semibold text-foreground shadow-[0_0_0_2px_var(--ring)]"
    : draft
      ? "border border-dashed border-primary/50 bg-transparent text-foreground"
      : "bg-muted text-foreground hover:bg-secondary";

  const thumb = (
    <DesignRound layers={layers} className={compact ? "size-7" : "size-9"} />
  );

  const cap = compact ? "max-w-[96px]" : "max-w-[108px]";

  return (
    <div
      data-testid="palette-chip"
      data-code={code}
      data-active={active || undefined}
      className={cn(
        // `min-h-12`, not `h-12`: a dedication is a genuine third line
        // (unsaved eyebrow + name + dedication) that a FIXED 48px would
        // clip — same "let it grow" fix `PaletteCard`'s own row already
        // needed for the same reason.
        "group relative flex min-h-12 shrink-0 items-center gap-2.5 rounded-full py-1 pl-1.5 pr-4 text-[13.5px] transition-colors",
        compact && "min-h-11 gap-2 pl-1 pr-3 text-[12.5px] sm:min-h-9",
        skin
      )}
    >
      {renaming ? (
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          {thumb}
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
            className="w-24 rounded-md border border-input bg-card px-1.5 py-0.5 text-[13.5px] font-semibold outline-none ring-2 ring-ring"
          />
        </span>
      ) : (
        <>
          <button
            ref={selectRef}
            type="button"
            onClick={onSelect}
            // R5-DESIGN-SWITCH AC4: a dim chip IS tappable (the tap switches
            // design via `?code=`) — inert only when there is no action at
            // all (the draft chip, which passes no `onSelect`).
            disabled={!onSelect}
            aria-current={active ? "true" : undefined}
            // R5-PALETTES task 13 (carried in, card 1's own lesson): the chip's
            // OUTER div is h-12, but only this <button> receives clicks/taps —
            // with no height of its own it shrinks to the thumb's 36px, under
            // the 44px touch minimum now that chips render on the phone (step 2's
            // Palettes tab). `min-h-11 sm:min-h-9` is the site-wide fix for
            // exactly this shape (cart-line-row.tsx's qty steppers): 44px where
            // a touch screen is the only input, back to the mockup's 36px from
            // `sm` up where a pointer usually is.
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-not-allowed sm:min-h-9"
          >
            {thumb}
            <span className="flex min-w-0 flex-col leading-tight">
              {draft && (
                <span className="text-[10px] tracking-[0.08em] text-primary uppercase">
                  {t("unsaved")}
                </span>
              )}
              <span className={cn(cap, "truncate")}>{name}</span>
            {/* One second line, and `dim` spends it on the OTHER design's
                name: the tap switches design too, so the chip says so
                upfront. Callers still pass `dedication` for dim chips — it
                is simply outranked here, not forgotten. */}
              {dim && dimDesignName ? (
                <span className={cn(cap, "truncate text-[10px] text-muted-foreground")}>
                  {dimDesignName}
                </span>
              ) : (
                <PaletteDedicationLine text={dedication} className={cap} />
              )}
            </span>
          </button>
          {active && (
            // Fix-wave finding 1: `hidden` (display:none) takes this OUT of the
            // tab order entirely — a display:none element can never receive
            // focus, so `focus-visible:grid` could never fire and only the
            // mouse ever revealed it. `opacity-0 pointer-events-none` keeps it
            // in the tree and tabbable; `group-focus-within` reveals it as soon
            // as focus lands anywhere in the chip (the SELECT button first,
            // since it's the earlier sibling), not only on the button itself.
            //
            // Fix wave PR3 finding 5: that hover/focus reveal is a no-op on a
            // phone — no hover, and nothing focuses a button it can't see to
            // tap in the first place. This chip only renders touch-side today
            // in step 2's mobile Palettes tab (task 12), always at `active`
            // for the one it's rendered on — so below `sm` it's just always
            // shown, at the 44px minimum; `sm:` restores the exact hover/focus
            // reveal at the mockup's 24px for every pointer-driven surface.
            <button
              type="button"
              onClick={onRenameStart}
              aria-label={t("rename")}
              title={t("rename")}
              className="ml-1 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground opacity-100 pointer-events-auto transition-opacity hover:bg-secondary sm:size-6 sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-focus-within:pointer-events-auto"
            >
              ✎
            </button>
          )}
          {onDelete && (
            // Same reveal rule as ✎ above, deliberately copy-pasted rather
            // than shared: the ✎ had a `display:none` bug that made it
            // mouse-only (a Critical finding) — anything DRY-ing these two
            // together risks reintroducing that coupling by editing "the
            // rename button" and silently carrying delete along, or vice
            // versa. Two small siblings, two independent classNames.
            //
            // Fix wave PR3 finding 5: unlike ✎, this one renders for every
            // saved chip, not only the active one — below `sm` it only gets
            // the always-shown/44px treatment when `active`, same scope the
            // ✎ button already has (a non-active chip on a phone stays as
            // unreachable as before this fix; widening that is a bigger,
            // separate change nobody asked for here).
            <button
              type="button"
              onClick={() => {
                const next = deleteTap(deleteArmed);
                setDeleteArmed(next.armed);
                if (next.fire) onDelete();
              }}
              onBlur={() => setDeleteArmed(disarm().armed)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setDeleteArmed(disarm().armed);
              }}
              aria-label={deleteArmed ? t("confirmDelete") : t("delete")}
              title={deleteArmed ? t("confirmDelete") : t("delete")}
              data-testid="palette-chip-delete"
              data-armed={deleteArmed ? "" : undefined}
              className={cn(
                "ml-1 grid shrink-0 place-items-center rounded-full text-muted-foreground transition-opacity hover:bg-secondary",
                "sm:size-6 sm:opacity-0 sm:pointer-events-none sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-focus-within:pointer-events-auto",
                active ? "size-11 opacity-100 pointer-events-auto" : "size-6 opacity-0 pointer-events-none",
                // armed: it must stay visible while the question is open, whatever the pointer does
                deleteArmed && "sm:w-auto sm:px-2 sm:opacity-100! sm:pointer-events-auto! bg-destructive/10 text-destructive text-[11px] font-medium"
              )}
            >
              {deleteArmed ? t("confirmDelete") : "✕"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The one place that decides how a dedication renders: quoted, truncated,
 * secondary-style, or nothing at all when there isn't one. `PaletteChip`
 * uses it for its own second line; `PaletteTile`/the sheet's draft tile
 * (palette-sheet.tsx), the mobile strip (painting-strip.tsx) and the cart
 * row's palette picker (cart-line-row.tsx) reuse it too — TL ruling: every
 * tile shows a dedication the same way, not a copy of the rule per file.
 * `className` lets a caller override the width cap (`max-w-[108px]` fits
 * this chip's own thumb+padding budget, not every caller's).
 */
export function PaletteDedicationLine({
  text,
  position,
  className,
}: {
  text?: string;
  /** DS §3.33 — renders " · Top"/"Bottom"/"Back" after the quote, `centre`
   *  (the default, and anything absent) stays mute. Poppins, not italic:
   *  this is a fact about the piece, not part of the dedication itself. */
  position?: TextPosition;
  className?: string;
}) {
  const t = useTranslations("cart.textPosition");
  if (!text) return null;
  return (
    <span className={cn("block max-w-[108px] truncate text-[10px] text-muted-foreground", className)}>
      «{text}»
      {position && position !== "centre" && (
        <span data-testid="custom-text-position" className="not-italic">
          {" "}
          · {t(position)}
        </span>
      )}
    </span>
  );
}
