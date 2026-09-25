import { describe, it, expect } from "vitest";
import {
  TOUR_DEFAULT,
  TOUR_KEY,
  isLastTip,
  next,
  parseTourState,
  sequenceForContext,
  start,
  tipFor,
  turnOff,
  type TourState,
} from "./tour";

/**
 * R5-TUTORIAL round 3 — one spine for everyone: `step1` → `step2` → `step3`
 * (kit reuses `step1`/`step2` unchanged and only replaces `step3` with its
 * own 3-tip `kit3`). `tipFor` is the ONE function that decides whether a tip
 * shows — see `.plans/r5-tutorial-round3.md` §Modello nuovo del dominio.
 *
 * T5 (QA round 2, TL ruling 25/9, D-026) — every sequence's own last tip is
 * now Done, muting THAT sequence alone (`TourState.done`), not a global
 * `off`. Before this, `next()` handed step1/step2's last tip off by setting
 * `seq: null` and relying on the visitor actually reaching the next step for
 * `tipFor` to land on it — staying on the SAME step re-derived that same
 * sequence from tip 1 forever, since `isLastTip` was true only for
 * step3/kit3 (AC1/AC2 below are the tests that would have caught it).
 */

const base = (over: Partial<TourState> = {}): TourState => ({
  ...TOUR_DEFAULT,
  ...over,
});

const ask = (
  step: 1 | 2 | 3,
  opts: {
    state?: TourState;
    kitMode?: boolean;
    welcomeOpen?: boolean;
    setBannerOpen?: boolean;
    hydrated?: boolean;
  } = {}
) =>
  tipFor({
    state: opts.state ?? TOUR_DEFAULT,
    hydrated: opts.hydrated ?? true,
    kitMode: opts.kitMode ?? false,
    welcomeOpen: opts.welcomeOpen ?? false,
    setBannerOpen: opts.setBannerOpen ?? false,
    step,
  });

describe("TOUR_KEY", () => {
  it("is the localStorage key the card asks for (definitive, per visitor)", () => {
    expect(TOUR_KEY).toBe("mk-tips-v1");
  });
});

describe("tipFor/next — step 1: 1 → 2 → Done (mutes step1 only)", () => {
  it("shows the first step1 tip", () => {
    expect(ask(1)).toEqual({ sequence: "step1", n: 1 });
  });

  it("next() advances step1 from 1 to 2 — no longer a no-op", () => {
    const state = start(TOUR_DEFAULT, "step1");
    const advanced = next(state, "step1");
    expect(advanced).toEqual(base({ seq: "step1", step: 2 }));
    expect(ask(1, { state: advanced })).toEqual({ sequence: "step1", n: 2 });
  });

  it("step1's last tip IS last — Next reads Done there (T5, was false before)", () => {
    expect(isLastTip({ sequence: "step1", n: 1 })).toBe(false);
    expect(isLastTip({ sequence: "step1", n: 2 })).toBe(true);
  });

  it("AC1 (D-026) — step1's Done mutes step1 only; step2 still starts at 1, untouched", () => {
    let state = start(TOUR_DEFAULT, "step1");
    state = next(state, "step1"); // tip 2 — the last one
    state = next(state, "step1"); // Done
    expect(state).toEqual(base({ seq: null, step: 1, done: ["step1"] }));

    // step1 is muted for good — staying "on step 1" no longer re-shows tip 1.
    expect(ask(1, { state })).toBeNull();
    // step2 is a DIFFERENT sequence, never touched by step1's Done.
    expect(ask(2, { state })).toEqual({ sequence: "step2", n: 1 });
  });

  it("shows nothing once off (the ✕, global)", () => {
    expect(ask(1, { state: base({ off: true }) })).toBeNull();
  });

  it("shows nothing before hydration", () => {
    expect(ask(1, { hydrated: false })).toBeNull();
  });
});

describe("tipFor/next — step 2: 1 → 2 → Done (mutes step2 only)", () => {
  it("starts at 1", () => {
    expect(ask(2)).toEqual({ sequence: "step2", n: 1 });
  });

  it("step2's tips: only the second one is last", () => {
    expect(isLastTip({ sequence: "step2", n: 1 })).toBe(false);
    expect(isLastTip({ sequence: "step2", n: 2 })).toBe(true);
  });

  it("AC2 (D-026) — step1 Done, then step2 Done: step2 parte da 1, poi si spegne da sola; step3 non ne risente", () => {
    let state = next(next(start(TOUR_DEFAULT, "step1"), "step1"), "step1"); // step1 Done
    expect(ask(2, { state })).toEqual({ sequence: "step2", n: 1 }); // step2 parte da 1

    state = next(state, "step2");
    expect(state).toEqual(base({ seq: "step2", step: 2, done: ["step1"] }));
    expect(ask(2, { state })).toEqual({ sequence: "step2", n: 2 });

    state = next(state, "step2"); // Done
    expect(state).toEqual(base({ seq: null, step: 1, done: ["step1", "step2"] }));
    expect(ask(2, { state })).toBeNull();
    expect(ask(3, { state })).toEqual({ sequence: "step3", n: 1 }); // untouched
  });
});

describe("tipFor/next — step 3: 1 → 2 → Done (mutes step3 only)", () => {
  it("starts at 1", () => {
    expect(ask(3)).toEqual({ sequence: "step3", n: 1 });
  });

  it("walks 1 → 2, then Done mutes step3 (not a global off any more)", () => {
    let state = start(TOUR_DEFAULT, "step3");
    expect(ask(3, { state })).toEqual({ sequence: "step3", n: 1 });

    state = next(state, "step3");
    expect(state).toEqual(base({ seq: "step3", step: 2 }));
    expect(ask(3, { state })).toEqual({ sequence: "step3", n: 2 });
    expect(isLastTip({ sequence: "step3", n: 2 })).toBe(true);

    state = next(state, "step3");
    expect(state).toEqual(base({ seq: null, step: 1, done: ["step3"] }));
    expect(state.off).toBe(false); // AC3 (D-026): Done is per-sequence, not global
    expect(ask(3, { state })).toBeNull();
  });
});

describe("tipFor — kit", () => {
  it("a kit never lands a tour on step 1 (the welcome IS its passo 0)", () => {
    expect(ask(1, { kitMode: true, state: start(TOUR_DEFAULT, "step2") })).toBeNull();
  });

  it("kit skips step1 regardless of step1's own tip count", () => {
    expect(
      ask(1, { kitMode: true, state: next(start(TOUR_DEFAULT, "step1"), "step1") })
    ).toBeNull();
  });

  it("welcome open → no tip at all, even in kit-mode", () => {
    expect(ask(2, { kitMode: true, welcomeOpen: true })).toBeNull();
  });

  it("step 2 in kit-mode is the SAME sequence as normal step 2", () => {
    expect(ask(2, { kitMode: true })).toEqual({ sequence: "step2", n: 1 });
    const afterFirst = next(start(TOUR_DEFAULT, "step2"), "step2");
    expect(ask(2, { kitMode: true, state: afterFirst })).toEqual({
      sequence: "step2",
      n: 2,
    });
  });

  it("step 3 in kit-mode walks kit3 1 → 2 → 3, then Done mutes kit3 only", () => {
    let state = start(TOUR_DEFAULT, "kit3");
    expect(ask(3, { kitMode: true, state })).toEqual({ sequence: "kit3", n: 1 });

    state = next(state, "kit3");
    expect(ask(3, { kitMode: true, state })).toEqual({ sequence: "kit3", n: 2 });

    state = next(state, "kit3");
    expect(ask(3, { kitMode: true, state })).toEqual({ sequence: "kit3", n: 3 });
    expect(isLastTip({ sequence: "kit3", n: 3 })).toBe(true);

    state = next(state, "kit3");
    expect(state.off).toBe(false);
    expect(state.done).toEqual(["kit3"]);
    expect(ask(3, { kitMode: true, state })).toBeNull();
  });
});

describe("tipFor — set: no tour", () => {
  it("shows nothing while the set banner is on screen, in or out of kit-mode", () => {
    expect(ask(3, { setBannerOpen: true })).toBeNull();
    expect(
      ask(3, { kitMode: true, setBannerOpen: true, state: start(TOUR_DEFAULT, "kit3") })
    ).toBeNull();
  });
});

describe("parseTourState", () => {
  it("defaults on null (nothing stored yet)", () => {
    expect(parseTourState(null)).toEqual(TOUR_DEFAULT);
  });

  it("defaults on garbage", () => {
    expect(parseTourState("{not json")).toEqual(TOUR_DEFAULT);
    expect(parseTourState("42")).toEqual(TOUR_DEFAULT);
    expect(parseTourState('"a string"')).toEqual(TOUR_DEFAULT);
  });

  it("a stored OLD sequence name (kit2/normal, round 2 shapes) does not pass — seq falls back to null (no migration; step is parsed independently)", () => {
    expect(parseTourState(JSON.stringify({ off: false, seq: "kit2", step: 2 }))).toEqual(
      base({ seq: null, step: 2 })
    );
    expect(parseTourState(JSON.stringify({ off: false, seq: "normal", step: 1 }))).toEqual(
      base({ seq: null, step: 1 })
    );
  });

  it("a stored state from before T5 (no `done` at all) reads as done: [] — tolerant of the older shape, nothing to migrate", () => {
    expect(parseTourState(JSON.stringify({ off: false, seq: "kit3", step: 2 }))).toEqual(
      base({ seq: "kit3", step: 2, done: [] })
    );
  });

  it("round-trips a valid state, done included", () => {
    const state: TourState = { off: false, seq: "kit3", step: 2, done: ["step1", "step2"] };
    expect(parseTourState(JSON.stringify(state))).toEqual(state);
  });

  it("drops an unknown sequence name inside `done`, keeps the rest", () => {
    expect(
      parseTourState(JSON.stringify({ off: false, seq: null, step: 1, done: ["step1", "kit2"] }))
    ).toEqual(base({ done: ["step1"] }));
  });
});

describe("turnOff — the ✕ is definitive, every sequence at once", () => {
  it("sets off and keeps the rest of the state", () => {
    expect(turnOff(base({ seq: "kit3", step: 2, done: ["step1"] }))).toEqual(
      base({ off: true, seq: "kit3", step: 2, done: ["step1"] })
    );
  });

  it("survives a serialize/parse round trip (the reload case)", () => {
    const off = turnOff(TOUR_DEFAULT);
    const roundTripped = parseTourState(JSON.stringify(off));
    expect(roundTripped).toEqual(off);
    expect(ask(1, { state: roundTripped })).toBeNull();
  });
});

describe("sequenceForContext — the same branching tipFor uses, reused by the header replay button", () => {
  it("step 1, whatever the mode", () => {
    expect(sequenceForContext(false, 1)).toBe("step1");
    expect(sequenceForContext(true, 1)).toBe("step1");
  });

  it("step 2, whatever the mode — normal and kit share the same sequence", () => {
    expect(sequenceForContext(false, 2)).toBe("step2");
    expect(sequenceForContext(true, 2)).toBe("step2");
  });

  it("step 3: normal → step3, kit → kit3", () => {
    expect(sequenceForContext(false, 3)).toBe("step3");
    expect(sequenceForContext(true, 3)).toBe("kit3");
  });
});

describe("start", () => {
  it("always begins a sequence at step 1 with tips on", () => {
    expect(start(TOUR_DEFAULT, "step2")).toEqual(base({ seq: "step2", step: 1 }));
    expect(start(TOUR_DEFAULT, "kit3")).toEqual(base({ seq: "kit3", step: 1 }));
  });

  it("un-does a previous Done for THAT sequence alone — replay after finishing", () => {
    const doneWithBoth = base({ off: false, seq: null, step: 1, done: ["step1", "step2"] });
    expect(start(doneWithBoth, "step1")).toEqual(
      base({ seq: "step1", step: 1, done: ["step2"] })
    );
  });

  it("also cancels a global off (the ✕), same as before", () => {
    const off = base({ off: true, seq: "step2", step: 2 });
    expect(start(off, "step2").off).toBe(false);
  });
});
