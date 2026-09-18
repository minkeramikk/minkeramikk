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
  /** Sticks the bar under the site header (`top-14`, matches its `h-14`). Off for
   *  static/side-by-side previews (mirrors the mockup's own `sticky=false` default). */
  sticky?: boolean;
};

export function PaletteBar({ mode, count, chips, extra, sticky = false }: PaletteBarProps) {
  // TODO:nb-review — palettes.bar.* NO copy is new, unreviewed (no live-site source: R5-PALETTES).
  const t = useTranslations("palettes.bar");
  const eyebrow = mode === "manage" ? t("eyebrowManage") : t("eyebrowPaint");
  const subtitle =
    mode === "manage" ? t("manageCount", { count, max: MAX_PALETTES }) : t("paintHint");

  return (
    <div
      data-testid="palette-bar"
      className={cn(
        sticky && "sticky top-14 z-30",
        "border-b border-border bg-[var(--mk-canvas)] shadow-[0_1px_0_var(--border)]"
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
