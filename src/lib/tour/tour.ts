/**
 * R5-TUTORIAL — pure domain for the guided tour (DS §3.32). One localStorage
 * flag, definitive and per visitor (never per session, card "Vincoli non
 * negoziabili"): once off, off for good, even after a reload.
 *
 * Round 3 — one spine for everyone: `step1` → `step2` → `step3`, in that
 * order, for every visitor. The kit only adds its own head (the welcome, and
 * "paint your pieces" on the basket) and swaps `step3` for its own 3-tip
 * `kit3` — `step1`/`step2` are IDENTICAL for normal and kit, not two
 * variants of the same idea any more.
 *
 * - `step1`: 1 tip, always anchored to the design grid. Its "Next" never
 *   advances anything (there is no counter to bump) and never turns tips
 *   off — doing so would also silence step 2's own tip.
 * - `step2`: 2 tips (options, then "go to your ceramics"). Its last tip
 *   hands off straight into step 3 without ever going through "off".
 * - `step3` / `kit3`: 2 / 3 tips. Their last tip is Done — off for good.
 *
 * `tipFor` is the ONE function that decides whether a tip shows — the
 * `[unit]` tests in `tour.test.ts` are tests of this function.
 */

export type TourSequence = "step1" | "step2" | "step3" | "kit3";

export interface TourState {
  off: boolean;
  /** The sequence in progress; `null` between hand-offs (step2 → step3) and
   *  before anything has ever run. */
  seq: TourSequence | null;
  /** The in-progress sequence's current tip (1-3); meaningless while `seq`
   *  is null. */
  step: number;
}

export const TOUR_KEY = "mk-tips-v1";

export const TOUR_DEFAULT: TourState = { off: false, seq: null, step: 1 };

const SEQUENCES: readonly TourSequence[] = ["step1", "step2", "step3", "kit3"];

/** How many tips each sequence has — the one place `next`/`isLastTip` read
 *  "is this the last one" from. */
const TIPS: Record<TourSequence, number> = { step1: 1, step2: 2, step3: 2, kit3: 3 };

function isTourSequence(v: unknown): v is TourSequence {
  return typeof v === "string" && (SEQUENCES as readonly string[]).includes(v);
}

/** Tolerant: anything that isn't a well-shaped `TourState` falls back to the
 *  default (a first landing) rather than throwing — same rule as
 *  `kit-context.ts`'s `readKitContext`. A stored OLD sequence name (round
 *  2's `kit2`/`normal`) also fails `isTourSequence` and falls back to
 *  `seq: null` — there is no migration, the visitor just restarts at 1. */
export function parseTourState(raw: string | null): TourState {
  if (!raw) return TOUR_DEFAULT;
  try {
    const parsed = JSON.parse(raw) as Partial<TourState> | null;
    if (typeof parsed !== "object" || parsed === null) return TOUR_DEFAULT;
    return {
      off: parsed.off === true,
      seq: isTourSequence(parsed.seq) ? parsed.seq : null,
      step:
        typeof parsed.step === "number" && Number.isInteger(parsed.step) && parsed.step >= 1
          ? parsed.step
          : 1,
    };
  } catch {
    return TOUR_DEFAULT;
  }
}

/**
 * Which sequence belongs to a given spot: step 1 and step 2 are the same
 * for everyone; step 3 splits on kit-mode. Used both by `tipFor` and by the
 * header's replay button, which asks "which sequence belongs to where I'm
 * standing" without duplicating the rule.
 */
export function sequenceForContext(kitMode: boolean, step: 1 | 2 | 3): TourSequence {
  if (step === 1) return "step1";
  if (step === 2) return "step2";
  return kitMode ? "kit3" : "step3";
}

/**
 * `null` when nothing should show; otherwise the sequence and which of its
 * tips is current. A kit never lands a tour on step 1 (the welcome IS its
 * passo 0) — DS §3.32.
 */
export function tipFor(i: {
  state: TourState;
  hydrated: boolean;
  kitMode: boolean;
  welcomeOpen: boolean;
  setBannerOpen: boolean;
  step: 1 | 2 | 3;
}): { sequence: TourSequence; n: 1 | 2 | 3 } | null {
  if (!i.hydrated || i.state.off || i.setBannerOpen || i.welcomeOpen) return null;
  if (i.kitMode && i.step === 1) return null;
  const sequence = sequenceForContext(i.kitMode, i.step);
  const n = (i.state.seq === sequence ? i.state.step : 1) as 1 | 2 | 3;
  return { sequence, n };
}

/**
 * Advances a sequence's own tip. `step1` persists nothing — one tip, no
 * counter, Next is a no-op (and never turns anything off — that would also
 * silence step 2). `step2`'s last tip hands off straight to step 3
 * (`seq: null`, so `tipFor` re-derives `step3`/`kit3` fresh, starting at 1)
 * without ever going through `off`. `step3`/`kit3`'s last tip is Done: it
 * turns tips off for good.
 */
export function next(state: TourState, sequence: TourSequence): TourState {
  if (sequence === "step1") return state;
  const current = state.seq === sequence ? state.step : 1;
  if (current < TIPS[sequence]) {
    return { off: false, seq: sequence, step: current + 1 };
  }
  if (sequence === "step2") {
    return { off: false, seq: null, step: 1 };
  }
  return turnOff(state);
}

/** The ✕ (or the last tip's Done): definitive, for this visitor. */
export function turnOff(state: TourState): TourState {
  return { ...state, off: true };
}

/**
 * Does this tip's Next button read "Done" and end the tour? Only `step3`
 * and `kit3` ever finish something — `step1` never advances and `step2`
 * hands off into step 3 instead of ending.
 */
export function isLastTip(tip: { sequence: TourSequence; n: number }): boolean {
  return (
    (tip.sequence === "step3" || tip.sequence === "kit3") && tip.n === TIPS[tip.sequence]
  );
}

/** «Show me how» / a fresh landing on a sequence: always starts at 1, tips on. */
export function start(sequence: TourSequence): TourState {
  return { off: false, seq: sequence, step: 1 };
}
