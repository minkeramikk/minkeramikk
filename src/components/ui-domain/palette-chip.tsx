"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Brush } from "lucide-react";
import { DesignRound } from "@/components/ui-domain/design-round";
import type { CartLayer } from "@/lib/cart/cart";
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
  /** Design pattern layers for the 36px composited thumb (same technique as the cart row). */
  layers: CartLayer[];
  /** This is the palette in use right now — bold surface, ring, `aria-current`. */
  active?: boolean;
  /** The current (unsaved) canvas colours — dashed border, «Unsaved» eyebrow over the name. */
  draft?: boolean;
  /** Belongs to another design than the one on screen — faded and genuinely disabled. */
  dim?: boolean;
  /** The OTHER design's name, shown as a subtitle — only rendered (and only meaningful) when `dim`. */
  dimDesignName?: string;
  /** Small paintbrush badge on the thumb — the active chip in paint mode. */
  brush?: boolean;
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
   * No confirm step on either side of this callback (deletePalette.ts's own
   * comment has the WHY) — clicking it deletes immediately.
   */
  onDelete?: () => void;
}

export function PaletteChip({
  code,
  name,
  layers,
  active = false,
  draft = false,
  dim = false,
  dimDesignName,
  brush = false,
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
      : dim
        ? "bg-muted text-muted-foreground opacity-50"
        : "bg-muted text-foreground hover:bg-secondary";

  const thumb = (
    <DesignRound layers={layers} className={cn("size-9", dim && "grayscale-[.3]")} />
  );

  return (
    <div
      data-testid="palette-chip"
      data-code={code}
      data-active={active || undefined}
      className={cn(
        "group relative flex h-12 shrink-0 items-center gap-2.5 rounded-full pl-1.5 pr-4 text-[13.5px] transition-colors",
        skin
      )}
    >
      {renaming ? (
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          {brush ? (
            <span className="relative shrink-0">
              {thumb}
              <span className="absolute -right-1 -bottom-1 grid size-4.5 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                <Brush className="size-2.5" strokeWidth={2.5} />
              </span>
            </span>
          ) : (
            thumb
          )}
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
            disabled={dim}
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
            {brush ? (
              <span className="relative shrink-0">
                {thumb}
                <span className="absolute -right-1 -bottom-1 grid size-4.5 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                  <Brush className="size-2.5" strokeWidth={2.5} />
                </span>
              </span>
            ) : (
              thumb
            )}
            <span className="flex min-w-0 flex-col leading-tight">
              {draft && (
                <span className="text-[10px] tracking-[0.08em] text-primary uppercase">
                  {t("unsaved")}
                </span>
              )}
              <span className="max-w-[108px] truncate">{name}</span>
              {dim && dimDesignName && (
                <span className="max-w-[108px] truncate text-[10px] text-muted-foreground">
                  {dimDesignName}
                </span>
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
            <button
              type="button"
              onClick={onRenameStart}
              aria-label={t("rename")}
              title={t("rename")}
              className="ml-1 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 pointer-events-none transition-opacity hover:bg-secondary group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
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
            <button
              type="button"
              onClick={onDelete}
              aria-label={t("delete")}
              title={t("delete")}
              className="ml-1 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 pointer-events-none transition-opacity hover:bg-secondary group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
            >
              ✕
            </button>
          )}
        </>
      )}
    </div>
  );
}
