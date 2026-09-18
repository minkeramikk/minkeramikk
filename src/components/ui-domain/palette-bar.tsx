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
  /** The chip row — typically a list of `PaletteChip`, plus a "+ New palette" chip. */
  chips: ReactNode;
  /** Right-hand slot, outside the scrolling lane — e.g. "Save as palette". */
  extra?: ReactNode;
  /** Sticks the bar at the very top of the viewport. Off for static/side-by-side
   *  previews (mirrors the mockup's own `sticky=false` default). */
  sticky?: boolean;
  /** Extra classes on the root — e.g. task 8's `md:-mx-5 md:-mt-7` full-bleed
   *  trick against `main`'s padding. MUST land on this root, not a wrapper:
   *  `position: sticky` only has room to hold while scrolling as long as its
   *  OWN parent is taller than it is — a wrapper sized to just this bar (its
   *  only child) gives it zero such room, so it would unstick the instant it
   *  arrives at `top`, instead of staying pinned for the rest of the scroll. */
  className?: string;
};

export function PaletteBar({
  mode,
  count,
  chips,
  extra,
  sticky = false,
  className,
}: PaletteBarProps) {
  // TODO:nb-review — palettes.bar.* NO copy is new, unreviewed (no live-site source: R5-PALETTES).
  const t = useTranslations("palettes.bar");
  const eyebrow = mode === "manage" ? t("eyebrowManage") : t("eyebrowPaint");
  const subtitle =
    mode === "manage" ? t("manageCount", { count, max: MAX_PALETTES }) : t("paintHint");

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
