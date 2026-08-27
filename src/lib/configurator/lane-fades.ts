/**
 * R4-STEP2 — sfumature laterali delle corsie orizzontali del pannello mobile:
 * accese SOLO finché c'è corsa da fare in quella direzione (mockup: `fades()`).
 * Pura: niente DOM, niente React. La tolleranza di 2px assorbe le larghezze
 * frazionarie che il browser riporta, che altrimenti terrebbero accesa una
 * fade su una corsia già in fondo.
 */
export interface LaneMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export interface LaneFades {
  left: boolean;
  right: boolean;
}

const SLACK = 2;

export function laneFades({
  scrollLeft,
  scrollWidth,
  clientWidth,
}: LaneMetrics): LaneFades {
  const max = scrollWidth - clientWidth;
  return {
    left: scrollLeft > SLACK,
    right: scrollLeft < max - SLACK,
  };
}
