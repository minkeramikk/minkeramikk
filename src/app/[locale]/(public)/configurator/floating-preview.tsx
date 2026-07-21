"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import {
  nextFloatState,
  FLOAT_INITIAL,
  FLOAT_DEFAULTS,
} from "@/lib/configurator/float-visibility";
import { useVisualViewportBottom } from "@/lib/configurator/use-visual-viewport-bottom";
import { cn } from "@/lib/utils";

/**
 * F31 — mobile step-2 floating preview: when the big PreviewCanvas leaves
 * the viewport, a round mini-plate FAB appears bottom-right, composed from
 * the SAME memoized layers (F19 pattern, same @512 URLs already in the
 * browser cache → zero new fetches). Tap → scroll back to the preview.
 *
 * Non-negotiable (QA-fix #3): this lives in a fixed OVERLAY and is
 * ALWAYS mounted — visibility is opacity/scale only, so appearing or
 * disappearing cannot move the layout by a single pixel. The show/hide
 * decision is the pure hysteresis in float-visibility.ts (two asymmetric
 * thresholds + stability window) driven by an IntersectionObserver here.
 *
 * TODO:nb-review — the new configurator.backToPreview Norwegian string in
 * no.json is a fresh translation.
 */
export function FloatingPreview({
  targetRef,
  layers,
  hideNearRef,
}: {
  /** the big preview's container — observed and scrolled back to */
  targetRef: RefObject<HTMLElement | null>;
  /** the canvas' memoized layers: {src, recolor} (recolor → multiply) */
  layers: { src: string; recolor?: boolean }[];
  /** R-EXTRA: finché QUESTO elemento è a schermo la bolla si spegne. È la riga
      CTA di fine colonna (step 2): la bolla è fixed in basso a destra e le
      finisce sopra appena entra in vista, e da quando la copia mobile del CTA
      non c'è più quella riga è l'unico modo di avanzare. */
  hideNearRef?: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("configurator");
  const [visible, setVisible] = useState(false);
  // R3-B: lift the FAB above the on-screen keyboard (iOS), same hook as the bar.
  const vvBottom = useVisualViewportBottom();
  const stateRef = useRef(FLOAT_INITIAL);
  const ratioRef = useRef(1);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const tick = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const next = nextFloatState(
        stateRef.current,
        ratioRef.current,
        performance.now()
      );
      stateRef.current = next;
      setVisible(next.visible);
      // a show is pending → re-evaluate once the stability window elapses
      if (!next.visible && next.pendingShowSince !== null) {
        const wait =
          FLOAT_DEFAULTS.showDelayMs -
          (performance.now() - next.pendingShowSince);
        timerRef.current = window.setTimeout(tick, Math.max(wait + 5, 5));
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        ratioRef.current = entries[entries.length - 1].intersectionRatio;
        tick();
      },
      {
        // R2-6 B1: a negative bottom margin shrinks the root's lower edge, so the
        // canvas reads as "leaving" while the plate is only starting to scroll
        // off — the bubble appears earlier. The asymmetric thresholds + stability
        // window (the anti-flip-flop hysteresis, QA-fix #3) are UNCHANGED.
        rootMargin: "0px 0px -20% 0px",
        threshold: [0, FLOAT_DEFAULTS.showBelow, FLOAT_DEFAULTS.hideAbove, 1],
      }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [targetRef]);

  const [ctaOnScreen, setCtaOnScreen] = useState(false);

  useEffect(() => {
    const el = hideNearRef?.current;
    if (!el) return;
    // Nessuna isteresi qui, di proposito: la riga CTA entra in viewport quando
    // l'utente arriva in fondo alla colonna e ci resta. Non è la comparsa
    // nervosa che l'isteresi di sopra (QA-fix #3) esiste per domare.
    const io = new IntersectionObserver(
      (entries) => setCtaOnScreen(entries[entries.length - 1].isIntersecting),
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hideNearRef]);

  const shown = visible && !ctaOnScreen;

  function scrollBack() {
    const el = targetRef.current;
    if (!el) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  return (
    <button
      type="button"
      data-testid="floating-preview"
      aria-label={t("backToPreview")}
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
      onClick={scrollBack}
      // above the iOS safe-area AND lifted clear of the one-handed thumb
      // rest zone (the very bottom-right corner is where the thumb sits);
      // z-40 = above content, below Radix overlays (z-50)
      style={{
        bottom: `calc(2.5rem + env(safe-area-inset-bottom) + ${vvBottom}px)`,
      }}
      className={cn(
        // R2-6 B2: ~2× the previous bubble (was size-24/96px) → size-40/160px,
        // hitting the requested ~2x (150–160px) target. Border/shadow
        // from tokens; safe-area offset (bottom) keeps it clear of the CTA bar.
        "fixed right-4 z-40 size-40 overflow-hidden rounded-full border border-border bg-card shadow-(--shadow-card) md:hidden",
        "transition-[opacity,transform] duration-200",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        shown
          ? "scale-100 opacity-100"
          : "pointer-events-none scale-75 opacity-0"
      )}
    >
      {layers.map((l, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- composited catalog art, same URLs as the big preview (browser cache)
        <img
          key={`${l.src}-${i}`}
          src={l.src}
          alt=""
          className="absolute inset-1 size-[calc(100%-0.5rem)] object-contain"
          style={l.recolor ? { mixBlendMode: "multiply" } : undefined}
        />
      ))}
    </button>
  );
}
