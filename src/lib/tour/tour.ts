/**
 * R5-TUTORIAL — pure domain for the three guided tours (DS §3.32). One
 * localStorage flag, definitive and per visitor (never per session, card
 * "Vincoli non negoziabili"): once off, off for good, even after a reload.
 *
 * Three situations, not three variants of one tour (DS §3.32 table):
 * - `normal`: one tip per step, the step the customer is actually on drives
 *   which tip shows — nothing to persist beyond "did they turn it off".
 * - `kit2` / `kit3`: the kit's own two legs (step 2, then step 3) — `kit2` is
 *   2 tips (round 2: the save-as-palette tip left for `palette-save-hint`,
 *   standalone and outside this state), `kit3` is 3 — each restarts at 1
 *   when it starts and hands off to the next leg without ever going
 *   through "off".
 *
 * `tipFor` is the ONE function that decides whether a tip shows — the AC1-3
 * `[unit]` tests in the card are tests of this function (plan §0.1-3); the
 * components that consume it just render whatever it returns.
 */

export type TourSequence = "normal" | "kit2" | "kit3";

export interface TourState {
  off: boolean;
  /** The kit sequence in progress; `normal` never reads or writes this. */
  seq: TourSequence | null;
  /** The kit sequence's current tip (1-3); `normal` never reads or writes this. */
  step: number;
}

export const TOUR_KEY = "mk-tips-v1";

export const TOUR_DEFAULT: TourState = { off: false, seq: null, step: 1 };

const SEQUENCES: readonly TourSequence[] = ["normal", "kit2", "kit3"];

function isTourSequence(v: unknown): v is TourSequence {
  return typeof v === "string" && (SEQUENCES as readonly string[]).includes(v);
}

/** Tolerant: anything that isn't a well-shaped `TourState` falls back to the
 *  default (a first landing) rather than throwing — same rule as
 *  `kit-context.ts`'s `readKitContext`. */
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
 * Round 2 (plan §Task A) — the branch `tipFor` used to keep to itself,
 * extracted so the header's replay button (Task E) can ask "which sequence
 * belongs to where I'm standing" without duplicating the rule. A kit never
 * lands a tour on step 1 (the welcome IS its passo 0), so that combination
 * falls back to `normal` — `tipFor` is what turns THAT into "show nothing"
 * (kitMode && step===1), this function only answers "which sequence".
 */
export function sequenceForContext(kitMode: boolean, step: 1 | 2 | 3): TourSequence {
  if (kitMode && step === 2) return "kit2";
  if (kitMode && step === 3) return "kit3";
  return "normal";
}

/**
 * `null` when nothing should show; otherwise the sequence and which of its
 * (1-3) tips is current. A kit never lands a tour on step 1 (the welcome IS
 * its passo 0) — DS §3.32.
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
  if (sequence === "normal") return { sequence, n: i.step };
  const n = (i.state.seq === sequence ? i.state.step : 1) as 1 | 2 | 3;
  return { sequence, n };
}

/**
 * Advances a sequence's own tip. `normal` persists nothing — the next tip
 * arrives on its own with the next page step, there is no counter to bump.
 * `kit2` is 2 tips now (round 2, plan Task A: the save-as-palette tip left
 * the guided sequence for good — `palette-save-hint.tsx` covers it, outside
 * this state entirely) — its last tip hands off straight to `kit3` (the
 * step-3 leg), no `off` in between. `kit3`'s last tip is Done: it turns tips
 * off for good.
 */
export function next(state: TourState, sequence: TourSequence): TourState {
  if (sequence === "normal") return state;
  const current = state.seq === sequence ? state.step : 1;
  if (sequence === "kit2") {
    return current >= 2
      ? { off: false, seq: "kit3", step: 1 }
      : { off: false, seq: "kit2", step: current + 1 };
  }
  // kit3
  return current >= 3
    ? turnOff(state)
    : { off: false, seq: "kit3", step: current + 1 };
}

/** The ✕ (or the last tip's Done): definitive, for this visitor. */
export function turnOff(state: TourState): TourState {
  return { ...state, off: true };
}

/**
 * Does this tip's Next button read "Done" and end the tour? `kit2`'s third
 * tip pushes forward into `kit3` instead ("Go to your ceramics") — never
 * "Done", it isn't finishing anything yet.
 */
export function isLastTip(tip: { sequence: TourSequence; n: number }): boolean {
  return tip.sequence !== "kit2" && tip.n === 3;
}

/** «Show me how» / a fresh landing on a sequence: always starts at 1, tips on. */
export function start(sequence: TourSequence): TourState {
  return { off: false, seq: sequence, step: 1 };
}
