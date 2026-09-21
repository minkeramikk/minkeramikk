"use client";

import { useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useLaneFades } from "@/lib/configurator/use-lane-fades";
import { arrowStep } from "@/lib/configurator/lane-scroll";
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
   * (`sticky top-4`). DEPRECATED for the step-3 mount (the kicker + heading
   * + card now stick as ONE opaque block, so the catalogue can't slide
   * through the gap — TL review 21/9); kept for any future standalone use.
   * Step 2 renders the same card in-flow (`pinned=false`).
   */
  pinned?: boolean;
}

export function PaletteCard({ chips, actions, activeName, pinned = false }: PaletteCardProps) {
  // TODO:nb-review — `palettes.card.paintingNow` NO copy is new ("Maler nå"),
  // unreviewed (no live-site source: R5-PALETTE-IN-ACTION). Title still reuses
  // `palettes.bar.eyebrowManage` ("Your palettes"/"Dine paletter", reviewed).
  // TODO:nb-review — lane arrows reuse `step2.scrollOptionsBack/Forward`.
  const tBar = useTranslations("palettes.bar");
  const tStep2 = useTranslations("configurator");
  const title = tBar("eyebrowManage");

  // TL review 21/9: ‹ › lane arrows (same pattern as the step-2 option lanes
  // and the design photo strip — `useLaneFades` + `scrollBy`, lit only while
  // there is road left in that direction, `hidden` = untabbable).
  const laneRef = useRef<HTMLDivElement>(null);
  const fades = useLaneFades(laneRef, chips);
  const scrollLane = (dir: -1 | 1) => {
    const lane = laneRef.current;
    if (lane) lane.scrollBy({ left: arrowStep(lane.clientWidth, dir), behavior: "smooth" });
  };
  // 36px disc + `after:-inset-1` = 44px touch target (§5), same skin as the
  // step-2 option-lane arrows (canvas surface, sits above the lane).
  // `flex` (not `hidden … flex` toggling: `hidden` attr wins when no road,
  // otherwise the disc shows) — the option lanes use `hidden max-md:flex`
  // because they are mobile-only; this lane is desktop-only, plain `flex`.
  const arrow =
    "absolute top-1/2 z-[3] size-9 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--mk-canvas)] text-sm ring-1 ring-border transition-opacity after:absolute after:-inset-1 after:content-[''] outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

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
      {/* TL review 21/9: the active chip's 2px ring was clipping at the
          lane's left edge (box-shadow draws OUTSIDE the border box, and the
          lane had no breathing room) — `px-1` insets the chips so the ring
          never touches the card edge. */}
      <div className="relative">
        <div
          ref={laneRef}
          role="group"
          aria-label={title}
          data-testid="palette-card-lane"
          data-scroll
          className="flex items-center gap-3 overflow-x-auto px-1 py-1 pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {chips}
        </div>
        <button
          type="button"
          onClick={() => scrollLane(-1)}
          aria-label={tStep2("step2.scrollOptionsBack")}
          data-testid="palette-card-lane-prev"
          hidden={!fades.left}
          className={cn(arrow, "left-0 flex")}
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => scrollLane(1)}
          aria-label={tStep2("step2.scrollOptionsForward")}
          data-testid="palette-card-lane-next"
          hidden={!fades.right}
          className={cn(arrow, "right-0 flex")}
        >
          ›
        </button>
      </div>
    </div>
  );
}
