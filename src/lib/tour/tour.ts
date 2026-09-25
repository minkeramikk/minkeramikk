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
 * - `step1`: 2 tips (the design grid, then "tap Continue" on the pill). Its
 *   last tip hands off straight into step 2 without ever going through
 *   "off" — going through "off" would also silence step 2's own tip
 *   (`tipFor`'s `state.off` guard is global).
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
  /**
   * T5 (QA round 2) — sequences the visitor has already finished via their
   * own "Done", each muted for good on its own (until replay) — NOT the
   * same as `off`, which mutes every sequence at once (the ✕ only). Before
   * this, a sequence's last tip advancing to `seq: null` relied on the
   * visitor actually LEAVING that step for `tipFor` to land on the next
   * sequence; staying put (never navigating away) re-derived the SAME
   * sequence from tip 1 — an endless "Next" step1/step2 could never
   * button out of, since `isLastTip` was true only for step3/kit3.
   */
  done: TourSequence[];
}

export const TOUR_KEY = "mk-tips-v1";

export const TOUR_DEFAULT: TourState = { off: false, seq: null, step: 1, done: [] };

const SEQUENCES: readonly TourSequence[] = ["step1", "step2", "step3", "kit3"];

/** How many tips each sequence has — the one place `next`/`isLastTip` read
 *  "is this the last one" from. */
const TIPS: Record<TourSequence, number> = { step1: 2, step2: 2, step3: 2, kit3: 3 };

function isTourSequence(v: unknown): v is TourSequence {
  return typeof v === "string" && (SEQUENCES as readonly string[]).includes(v);
}

/** Tolerant: anything that isn't a well-shaped `TourState` falls back to the
 *  default (a first landing) rather than throwing — same rule as
 *  `kit-context.ts`'s `readKitContext`. A stored OLD sequence name (round
 *  2's `kit2`/`normal`) also fails `isTourSequence` and falls back to
 *  `seq: null` — there is no migration, the visitor just restarts at 1. A
 *  stored state from BEFORE T5 (no `done` at all) reads as `done: []` —
 *  same "tolerant of an older shape" rule, nothing to migrate. */
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
      done: Array.isArray(parsed.done) ? parsed.done.filter(isTourSequence) : [],
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
  if (i.state.done.includes(sequence)) return null;
  const n = (i.state.seq === sequence ? i.state.step : 1) as 1 | 2 | 3;
  return { sequence, n };
}

/**
 * Advances a sequence's own tip. Before the last one, just moves the
 * counter. On the last one (T5: every sequence, not only step3/kit3) —
 * Done — it adds THIS sequence to `done` and clears `seq`, so `tipFor`
 * re-derives the next context fresh, starting at 1, the moment the visitor
 * actually reaches it; staying put just keeps `tipFor` returning null for
 * this (now-done) sequence, no more endless "Next" (see `TourState.done`).
 */
export function next(state: TourState, sequence: TourSequence): TourState {
  const current = state.seq === sequence ? state.step : 1;
  if (current < TIPS[sequence]) {
    return { ...state, off: false, seq: sequence, step: current + 1 };
  }
  return {
    ...state,
    off: false,
    seq: null,
    step: 1,
    done: state.done.includes(sequence) ? state.done : [...state.done, sequence],
  };
}

/** The ✕: definitive, for this visitor, every sequence at once. */
export function turnOff(state: TourState): TourState {
  return { ...state, off: true };
}

/** Does this tip's Next button read "Done"? Every sequence's own last tip
 *  does now (T5) — Done only mutes THAT sequence, so there's no reason for
 *  step1/step2 to still say "Next" on theirs. */
export function isLastTip(tip: { sequence: TourSequence; n: number }): boolean {
  return tip.n === TIPS[tip.sequence];
}

/** «Show me how» / the header's replay: always starts THIS sequence at 1,
 *  tips on globally, and un-does it if a previous "Done" had muted it —
 *  every OTHER sequence's own `done`/progress is untouched. */
export function start(state: TourState, sequence: TourSequence): TourState {
  return {
    ...state,
    off: false,
    seq: sequence,
    step: 1,
    done: state.done.filter((s) => s !== sequence),
  };
}
