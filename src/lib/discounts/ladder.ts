import {
  nextTier,
  tierFor,
  usableTiers,
  type DiscountTier,
} from "@/lib/discounts/discount";

/**
 * R4-SCONTI-2 §C — the quantity scale as a PROGRESSION, ready to draw.
 *
 * Pure geometry and state: no React, no Money. The component turns `position`
 * and `fill` into CSS and the percentages into money; everything that decides
 * WHICH step is which lives here, where it can be unit-tested per combination
 * (below the first step, within reach, applied, past the last, no scale).
 *
 * The tiers come from `getDiscountConfig()` through `usableTiers` — the very
 * filter the engine prices with (minQty >= 2, pct > 0), so the scale on the
 * sheet can never advertise a step the cart would not honour.
 */
export interface LadderStep {
  minQty: number;
  pct: number;
  /** reached = earned · next = the one within reach · future = further up. */
  state: "reached" | "next" | "future";
  /** The quantity sits exactly here: the marker is not pressable. */
  current: boolean;
  /** Percent along the track. ORDINAL, not proportional to the quantity:
   *  `(i + 0.5) / n`, half a step of margin at each end so neither a marker
   *  nor a label is ever clipped at the edges. */
  position: number;
}

export interface Ladder {
  steps: LadderStep[];
  /** CART + SELECTOR, never the selector alone (§C). */
  qty: number;
  /** The tier the quantity earns; 0 when it earns none. */
  pct: number;
  next: DiscountTier | null;
  /** Percent of the track that is filled. */
  fill: number;
  /** At or past the last step — no further step may be promised. */
  best: boolean;
}

/** Null when there is no scale to draw: no empty frame, ever (§C edge cases). */
export function ladderFor(qty: number, tiers: DiscountTier[]): Ladder | null {
  // usableTiers sorts DESCENDING (the engine reads it top-down); the ladder is
  // read left to right.
  const asc = [...usableTiers(tiers)].reverse();
  const n = asc.length;
  if (n === 0) return null;

  const position = (i: number) => ((i + 0.5) / n) * 100;
  const last = asc[n - 1];
  const best = qty >= last.minQty;
  const up = nextTier(qty, tiers);

  // The fill interpolates between the MARKERS but on the real quantities: the
  // markers are evenly spaced, the numbers behind them are not.
  let fill: number;
  if (best) fill = 100;
  else {
    let k = 0;
    while (k < n && qty >= asc[k].minQty) k++;
    const fromQty = k === 0 ? 0 : asc[k - 1].minQty;
    const fromPos = k === 0 ? 0 : position(k - 1);
    fill = fromPos + ((qty - fromQty) / (asc[k].minQty - fromQty)) * (position(k) - fromPos);
  }

  return {
    steps: asc.map((t, i) => ({
      minQty: t.minQty,
      pct: t.pct,
      state: qty >= t.minQty ? "reached" : up?.minQty === t.minQty ? "next" : "future",
      current: qty === t.minQty,
      position: position(i),
    })),
    qty,
    pct: tierFor(qty, tiers),
    next: up,
    fill,
    best,
  };
}
