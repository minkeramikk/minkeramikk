import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * R5-PALETTE-IN-ACTION task 1 — the mockup's `PaletteCard`
 * (`.varco/docs/design/mockups/r5-palette-in-action/mockup.html`,
 * `function PaletteCard(...)`). Purely presentational: the chip list and the
 * right-hand action slot are handed in by the caller (`chips`/`actions`, e.g.
 * a row of `PaletteChip` plus "+ New" or "Save as palette") — this component
 * owns no palette data and no state of its own. Reuses `PaletteChip`
 * (dedication line included) via the callers, untouched (AC4).
 */
interface PaletteCardProps {
  /** The chip row — typically a list of `PaletteChip`. The ONLY lane content. */
  chips: ReactNode;
  /** Right-hand header slot, outside the scrolling lane — e.g. "+ New" or "Save as palette". */
  actions: ReactNode;
  /**
   * Step 3 only: the badge text, already formatted by the caller (the
   * "Painting now: X" i18n lands in T2) — rendered verbatim when present.
   */
  activeName?: string;
  /**
   * Step 3: pins the card to the top of its own catalogue column
   * (`sticky top-4`); step 2 renders the same card in-flow (`pinned=false`).
   */
  pinned?: boolean;
}

export function PaletteCard({ chips, actions, activeName, pinned = false }: PaletteCardProps) {
  // TODO:nb-review — `palettes.card.paintingNow` NO copy is new ("Maler nå"),
  // unreviewed (no live-site source: R5-PALETTE-IN-ACTION). Title still reuses
  // `palettes.bar.eyebrowManage` ("Your palettes"/"Dine paletter", reviewed).
  const tBar = useTranslations("palettes.bar");
  const title = tBar("eyebrowManage");

  return (
    <div
      data-testid="palette-card"
      className={cn(
        // TL override 21/9 (review manuale): superficie canvas bianca come la
        // vecchia PaletteBar — mockup F1/F3, card §Origine e DS :56 dicono
        // fondo tinta `secondary/60`, mai bianco. Se il PM rivuole la tinta,
        // una riga qui.
        "rounded-lg border border-primary/20 bg-[var(--mk-canvas)] p-4",
        pinned && "sticky top-4 z-20"
      )}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-primary">
          {title}
        </span>
        {activeName && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {activeName}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">{actions}</span>
      </div>
      <div
        role="group"
        aria-label={title}
        data-testid="palette-card-lane"
        data-scroll
        className="flex items-center gap-3 overflow-x-auto py-1 pr-2"
      >
        {chips}
      </div>
    </div>
  );
}
