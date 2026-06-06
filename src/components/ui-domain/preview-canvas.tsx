"use client";

import { useEffect, useRef, useState } from "react";

export interface PreviewLayer {
  src: string;
  /** Recolorable layers blend with multiply (legacy-validated technique, ADR 0002). */
  recolor?: boolean;
}

/**
 * Live design preview (DESIGN-SYSTEM §3.11) — the continuity element of the
 * configurator (F14):
 * - first paint is the composed plate (layers from SSR), never a hole;
 * - changing design cross-fades ~200ms: the OLD layers stay painted until the
 *   NEW ones have loaded, then the new ones fade in and REPLACE them (no stale
 *   layers left behind, no white flash);
 * - `prefers-reduced-motion: reduce` → no fade, immediate swap once loaded;
 * - skeleton shows only when there is genuinely nothing to display yet.
 */

const FADE_MS = 200;

const keyOf = (layers: PreviewLayer[]) => layers.map((l) => l.src).join("|");

function preloadAll(layers: PreviewLayer[]): Promise<void> {
  return Promise.all(
    layers.map(
      (l) =>
        new Promise<void>((resolve) => {
          const img = new window.Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = l.src;
        })
    )
  ).then(() => undefined);
}

function LayerStack({
  layers,
  alt,
  priority,
}: {
  layers: PreviewLayer[];
  alt: string;
  priority?: boolean;
}) {
  return (
    <div
      className="relative h-[84%] w-[84%]"
      style={{
        filter:
          "drop-shadow(0 14px 28px color-mix(in oklab, var(--mk-dark) 18%, transparent))",
      }}
    >
      {layers.map((layer, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- composited catalog art from storage
        <img
          key={`${layer.src}-${i}`}
          src={layer.src}
          alt={i === 0 ? alt : ""}
          loading={priority && i === 0 ? "eager" : undefined}
          fetchPriority={priority && i === 0 ? "high" : undefined}
          className="absolute inset-0 h-full w-full object-contain"
          style={layer.recolor ? { mixBlendMode: "multiply" } : undefined}
        />
      ))}
    </div>
  );
}

export function PreviewCanvas({
  layers,
  caption,
  alt,
  className,
}: {
  layers: PreviewLayer[];
  caption?: string;
  alt: string;
  className?: string;
}) {
  const targetKey = keyOf(layers);

  // committed layers (painted now); initialized from props so SSR paints them
  const [shown, setShown] = useState<{ key: string; layers: PreviewLayer[] }>({
    key: targetKey,
    layers,
  });
  // layers fading in on top during a transition (null when stable)
  const [incoming, setIncoming] = useState<{
    key: string;
    layers: PreviewLayer[];
  } | null>(null);
  const [fadeIn, setFadeIn] = useState(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (targetKey === shown.key) {
      setIncoming(null); // back to current set: drop any in-flight overlay
      return;
    }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let cancelled = false;
    preloadAll(layers).then(() => {
      if (cancelled) return;
      if (reduce) {
        setShown({ key: targetKey, layers }); // immediate swap (AC4)
        setIncoming(null);
        return;
      }
      // mount the new layers on top at opacity 0, then fade to 1 (AC3)
      setIncoming({ key: targetKey, layers });
      setFadeIn(false);
      requestAnimationFrame(() => {
        if (!cancelled) requestAnimationFrame(() => setFadeIn(true));
      });
    });

    return () => {
      cancelled = true;
    };
    // drive ONLY off the content key: same content across re-renders is a no-op
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, shown.key]);

  // commit the overlay into `shown` once the fade has had time to run
  useEffect(() => {
    if (!incoming || !fadeIn) return;
    commitTimer.current = setTimeout(() => {
      setShown(incoming);
      setIncoming(null);
      setFadeIn(false);
    }, FADE_MS);
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
  }, [incoming, fadeIn]);

  const nothingToShow = shown.layers.length === 0 && !incoming;

  return (
    <div className={className} data-testid="preview-canvas">
      <div className="relative mx-auto flex aspect-square max-w-[520px] items-center justify-center rounded-lg bg-card shadow-(--shadow-card)">
        {nothingToShow && (
          <div
            data-testid="preview-skeleton"
            className="absolute inset-[8%] animate-pulse rounded-lg bg-muted"
          />
        )}

        {shown.layers.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <LayerStack layers={shown.layers} alt={alt} priority />
          </div>
        )}

        {incoming && (
          <div
            className="absolute inset-0 flex items-center justify-center transition-opacity"
            style={{ opacity: fadeIn ? 1 : 0, transitionDuration: `${FADE_MS}ms` }}
            data-testid="preview-incoming"
          >
            <LayerStack layers={incoming.layers} alt={alt} />
          </div>
        )}
      </div>
      {caption && (
        <p className="mt-3 text-center text-xs italic text-muted-foreground">
          {caption}
        </p>
      )}
    </div>
  );
}
