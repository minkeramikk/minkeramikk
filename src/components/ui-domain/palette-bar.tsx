import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { MAX_PALETTES } from "@/lib/palettes/palettes";
import { cn } from "@/lib/utils";

/**
 * R5-PALETTES task 7 — the mockup's `PaletteBar`
 * (`docs/revision5/mockup-palettebar.html`, `function PaletteBar(...)`). Purely
 * presentational: the chip list and the right-hand slot are handed in by the
 * caller (`chips`/`extra`, e.g. a row of `PaletteChip` plus a "Save as palette"
 * or "+ New palette" control) — this component owns no palette data and no
 * state of its own.
 *
 * `mode: "manage"` needs `count` (how many of the customer's `MAX_PALETTES`
 * slots are used, step 2) so the eyebrow can say "n of 10 saved"; `mode:
 * "paint"` (step 3) has no count to show, hence the discriminated union.
 */
type PaletteBarProps = (
  | { mode: "manage"; count: number }
  | { mode: "paint"; count?: undefined }
) & {
  /**
   * `mode="paint"` only (ignored in `manage`): whether the chip painting
   * right now is the unsaved on-screen colours rather than a saved palette
   * (R5-PALETTES follow-up). Lives in the shared part of the type, not the
   * `paint` arm of the union above — a discriminated union requires every
   * destructured key to exist on EVERY arm, and this is meaningless (but
   * harmless) on `manage`, not absent from the type. Picks the subtitle:
   * with a draft on screen, say these colours aren't saved; with saved
   * palettes, say how to switch — the old one-liner ("Tap a row · or add")
   * assumed there was always at least one chip to tap.
   */
  draft?: boolean;
  /** The chip row — typically a list of `PaletteChip`, plus a "+ New palette" chip. */
  chips: ReactNode;
  /** Right-hand slot, outside the scrolling lane — e.g. "Save as palette". */
  extra?: ReactNode;
  /** Sticks the bar at the very top of the viewport. Off for static/side-by-side
   *  previews (mirrors the mockup's own `sticky=false` default). */
  sticky?: boolean;
  /** Extra classes on the root — e.g. task 8's `md:-mt-7` (still needed: it
   *  cancels `main`'s own top padding so the bar sits flush under the header
   *  before any scroll). The HORIZONTAL full-bleed is owned by this
   *  component itself now (see the root's own `md:w-screen` below) — a
   *  caller-side `-mx-5` would only have cancelled `main`'s padding, capping
   *  the bar at the page's own max-w column (PR3 fix: the TL's "the bar
   *  sfora on desktop", really the opposite — it stopped short of the
   *  viewport edges). MUST land on this root, not a wrapper: `position:
   *  sticky` only has room to hold while scrolling as long as its OWN
   *  parent is taller than it is — a wrapper sized to just this bar (its
   *  only child) gives it zero such room, so it would unstick the instant it
   *  arrives at `top`, instead of staying pinned for the rest of the scroll. */
  className?: string;
};

export function PaletteBar({
  mode,
  count,
  draft = false,
  chips,
  extra,
  sticky = false,
  className,
}: PaletteBarProps) {
  // TODO:nb-review — palettes.bar.* NO copy is new, unreviewed (no live-site source: R5-PALETTES).
  const t = useTranslations("palettes.bar");
  const eyebrow = mode === "manage" ? t("eyebrowManage") : t("eyebrowPaint");
  // R5-PALETTES follow-up: the old single `paintHint` ("Tap a row · or add")
  // described a bar that always had at least one saved chip to tap — false
  // the moment nothing is saved yet (the draft chip has nothing to switch
  // TO). Two truths instead of one guess: with a draft on screen, say these
  // colours aren't saved; with saved palettes, say how to switch.
  const subtitle =
    mode === "manage"
      ? t("manageCount", { count, max: MAX_PALETTES })
      : draft
        ? t("paintHintDraft")
        : t("paintHintSaved");

  return (
    <div
      data-testid="palette-bar"
      className={cn(
        // R5-PALETTES task 8: `top-0`, NOT `top-14` — the mockup's `top-14`
        // assumes a sticky site header, which this site only has on mobile
        // (site-header.tsx:15, `max-md:sticky` — R2-6 C, desktop chrome
        // unchanged). On desktop the header scrolls away with the page, so
        // pinning this bar at the true viewport top is what keeps it "under
        // the header" once scrolled — before any scroll it already sits
        // there in normal flow (the caller places it right after the
        // header). See progress.md's PR-2 ruling for the caller-side offset
        // this implies (configurator-client.tsx's preview column).
        sticky && "sticky top-0 z-30",
        "border-b border-border bg-[var(--mk-canvas)] shadow-[0_1px_0_var(--border)]",
        // PR3 fix ("la palette sfora su desktop" — the bar's surface stopped
        // short of the viewport edges by ~110px at 1280 because it only ever
        // cancelled `main`'s padding, never its `max-w-[1060px]` cap): break
        // the SURFACE out to the true viewport edges with `margin-left`, not
        // `left`/`right` insets — insets on a `position: sticky` element set
        // its sticking THRESHOLD, not a static offset, so they'd silently
        // change when/whether it sticks instead of just shifting it. `main`
        // (public-shell.tsx) centres its column with `mx-auto`, and every
        // wrapper between it and this root is a plain 100%-width, no-padding
        // div, so this root's own containing block is ALSO centred on the
        // viewport — the classic `calc(50% - 50vw)` breakout is exact here,
        // no matter `main`'s `px-5`: both the `50%` and the `50vw` resolve
        // against boxes centred on the same axis, and the padding term
        // cancels out of the algebra. Safe from the usual "100vw overflows
        // past a scrollbar" trap because `globals.css` sets `scrollbar-gutter:
        // stable` on `html` — the gutter is always reserved, so `100vw`
        // already excludes it. The CONTENT row right below keeps its own
        // `max-w-[1060px] mx-auto px-5` unchanged — same column, same 1060,
        // so chips/eyebrow/extra land exactly where they always have; only
        // the surface (bg/border/shadow) reaches the edges.
        "md:w-screen md:ml-[calc(50%-50vw)]",
        className
      )}
    >
      <div className="mx-auto flex h-[68px] max-w-[1060px] items-center gap-3 px-5">
        <span className="mr-1 flex w-[88px] shrink-0 flex-col leading-tight">
          <span className="text-[10.5px] font-semibold tracking-[0.08em] text-primary uppercase">
            {eyebrow}
          </span>
          <span className="text-[11px] text-muted-foreground">{subtitle}</span>
        </span>
        <div
          role="group"
          aria-label={eyebrow}
          data-testid="palette-lane"
          className="flex min-w-0 items-center gap-2 overflow-x-auto py-1"
        >
          {chips}
        </div>
        {extra}
      </div>
    </div>
  );
}
