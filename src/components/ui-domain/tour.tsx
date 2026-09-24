"use client";

import type { CSSProperties, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { isLastTip, type TourSequence } from "@/lib/tour/tour";

/**
 * Resolves the currently-showing tip (if any) to its rendered copy —
 * `tour.<sequence>.<n>` in both dictionaries, `<b>` rendered via `t.rich`,
 * `count` fed through for the two keys that pluralise on it (`kit2.3`,
 * `kit3.1`) and ignored by the rest.
 *
 * TODO:nb-review — every `tour.*` NO string is new copy (DS §3.32), no
 * source on the live site; the client hasn't reviewed it yet.
 */
export function useTourTip(
  tip: { sequence: TourSequence; n: 1 | 2 | 3 } | null,
  count: number
): { text: ReactNode; last: boolean } | null {
  const t = useTranslations("tour");
  if (!tip) return null;
  return {
    text: t.rich(`${tip.sequence}.${tip.n}`, {
      b: (chunks) => <b>{chunks}</b>,
      count,
    }),
    last: isLastTip(tip),
  };
}

/**
 * R5-TUTORIAL — the two tour primitives (DS §3.32). `Hotspot` anchors a
 * numbered badge + popover to its (`relative`) parent, desktop only.
 * `CoachBar` is the 390 equivalent: never anchored — a plain strip, `fixed`
 * to the viewport foot, except `inSheet` (kit3 on 390, DS §3.32 "il foglio
 * arriva già aperto"): the open basket sheet already has a top edge to dock
 * to, and two fixed strips at the bottom of the screen don't coexist
 * (mockup.html `kit3Scene`, found trying, not reasoning — see the note by
 * `coach()`).
 *
 * The shared Next/Done/✕ labels live here (`tour.*`), not per call site: the
 * caller only supplies the tip's own copy (`text`, already rendered via
 * `t.rich` so the `<b>` in the dictionary comes through).
 */
function TourActions({
  last,
  onNext,
  onOff,
  primaryClassName,
}: {
  last: boolean;
  onNext: () => void;
  onOff: () => void;
  primaryClassName: string;
}) {
  const t = useTranslations("tour");
  return (
    <>
      <button type="button" onClick={onNext} className={primaryClassName}>
        {last ? t("done") : t("next")}
      </button>
      <button
        type="button"
        onClick={onOff}
        aria-label={t("off")}
        data-testid="tour-dismiss"
        className="shrink-0 text-muted-foreground"
      >
        ✕
      </button>
    </>
  );
}

export function Hotspot({
  n,
  text,
  last,
  onNext,
  onOff,
}: {
  n: 1 | 2 | 3;
  text: ReactNode;
  last: boolean;
  onNext: () => void;
  onOff: () => void;
}) {
  return (
    <span
      data-testid="tour-hotspot"
      data-step={n}
      className="absolute -right-2 -top-2 z-30 hidden md:block"
    >
      <span className="absolute bottom-full right-0 mb-2 flex w-max max-w-[268px] items-start gap-1.5 rounded-lg border border-primary/30 bg-popover px-2.5 py-2 text-left text-[12px] leading-snug shadow-lg">
        <span className="min-w-0 flex-1">{text}</span>
        <TourActions
          last={last}
          onNext={onNext}
          onOff={onOff}
          primaryClassName="shrink-0 font-semibold text-primary"
        />
      </span>
      <span className="tour-pulse grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
        {n}
      </span>
    </span>
  );
}

export function CoachBar({
  n,
  text,
  last,
  onNext,
  onOff,
  inSheet = false,
  style,
}: {
  n: 1 | 2 | 3;
  text: ReactNode;
  last: boolean;
  onNext: () => void;
  onOff: () => void;
  /** DS §3.32: docked at the open basket sheet's top edge instead of the
   *  viewport's — the sheet is already up, so the bar becomes its header. */
  inSheet?: boolean;
  /** Step 3 normal: parks above the sticky order bar when it's showing, an
   *  inline `bottom` override (wins over the `bottom-0` class below) — DS
   *  §3.32 "mai due strisce impilate in fondo". */
  style?: CSSProperties;
}) {
  return (
    <div
      data-testid="tour-coachbar"
      style={style}
      className={cn(
        "z-40 flex items-center gap-3 border-primary/30 bg-popover px-4 py-3 text-[13px] md:hidden",
        inSheet
          ? "static rounded-t-xl border-b border-t-0"
          : "fixed inset-x-0 bottom-0 border-t shadow-[0_-8px_24px_rgba(43,35,48,.12)]"
      )}
    >
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
        {n}
      </span>
      <span className="min-w-0 flex-1 leading-snug">{text}</span>
      <TourActions
        last={last}
        onNext={onNext}
        onOff={onOff}
        primaryClassName="shrink-0 rounded-full bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground"
      />
    </div>
  );
}
