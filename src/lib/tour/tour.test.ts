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

describe("tipFor — step 1: a single tip, Next is a no-op", () => {
  it("shows the one step1 tip", () => {
    expect(ask(1)).toEqual({ sequence: "step1", n: 1 });
  });

  it("next() never advances step1 — one tip only, Next must not turn it off", () => {
    const state = start("step1");
    expect(next(state, "step1")).toEqual(state);
    expect(ask(1, { state: next(state, "step1") })).toEqual({ sequence: "step1", n: 1 });
  });

  it("shows nothing once off", () => {
    expect(ask(1, { state: base({ off: true }) })).toBeNull();
  });

  it("shows nothing before hydration", () => {
    expect(ask(1, { hydrated: false })).toBeNull();
  });
});

describe("tipFor/next — step 2: 1 → 2 → hand-off to step 3 (no off in between)", () => {
  it("starts at 1", () => {
    expect(ask(2)).toEqual({ sequence: "step2", n: 1 });
  });

  it("walks 1 → 2, then hands off to step3/1 without ever going through off", () => {
    let state = start("step2");
    expect(ask(2, { state })).toEqual({ sequence: "step2", n: 1 });

    state = next(state, "step2");
    expect(state).toEqual({ off: false, seq: "step2", step: 2 });
    expect(ask(2, { state })).toEqual({ sequence: "step2", n: 2 });

    // last step2 tip hands off — seq:null, step:1 — step 3 restarts at 1 on
    // its own, no `off` step in between.
    state = next(state, "step2");
    expect(state).toEqual({ off: false, seq: null, step: 1 });
    expect(ask(3, { state })).toEqual({ sequence: "step3", n: 1 });
  });

  it("step2's tips are never last — Next never reads Done there", () => {
    expect(isLastTip({ sequence: "step2", n: 1 })).toBe(false);
    expect(isLastTip({ sequence: "step2", n: 2 })).toBe(false);
  });
});

describe("tipFor/next — step 3: 1 → 2 → off (Done)", () => {
  it("starts at 1", () => {
    expect(ask(3)).toEqual({ sequence: "step3", n: 1 });
  });

  it("walks 1 → 2, then Done turns tips off for good", () => {
    let state = start("step3");
    expect(ask(3, { state })).toEqual({ sequence: "step3", n: 1 });

    state = next(state, "step3");
    expect(state).toEqual({ off: false, seq: "step3", step: 2 });
    expect(ask(3, { state })).toEqual({ sequence: "step3", n: 2 });
    expect(isLastTip({ sequence: "step3", n: 2 })).toBe(true);

    state = next(state, "step3");
    expect(state.off).toBe(true);
    expect(ask(3, { state })).toBeNull();
  });
});

describe("tipFor — kit", () => {
  it("a kit never lands a tour on step 1 (the welcome IS its passo 0)", () => {
    expect(ask(1, { kitMode: true, state: start("step2") })).toBeNull();
  });

  it("welcome open → no tip at all, even in kit-mode", () => {
    expect(ask(2, { kitMode: true, welcomeOpen: true })).toBeNull();
  });

  it("step 2 in kit-mode is the SAME sequence as normal step 2", () => {
    expect(ask(2, { kitMode: true })).toEqual({ sequence: "step2", n: 1 });
    const afterFirst = next(start("step2"), "step2");
    expect(ask(2, { kitMode: true, state: afterFirst })).toEqual({
      sequence: "step2",
      n: 2,
    });
  });

  it("step 3 in kit-mode walks kit3 1 → 2 → 3, then off", () => {
    let state = start("kit3");
    expect(ask(3, { kitMode: true, state })).toEqual({ sequence: "kit3", n: 1 });

    state = next(state, "kit3");
    expect(ask(3, { kitMode: true, state })).toEqual({ sequence: "kit3", n: 2 });

    state = next(state, "kit3");
    expect(ask(3, { kitMode: true, state })).toEqual({ sequence: "kit3", n: 3 });
    expect(isLastTip({ sequence: "kit3", n: 3 })).toBe(true);

    state = next(state, "kit3");
    expect(state.off).toBe(true);
    expect(ask(3, { kitMode: true, state })).toBeNull();
  });
});

describe("tipFor — set: no tour", () => {
  it("shows nothing while the set banner is on screen, in or out of kit-mode", () => {
    expect(ask(3, { setBannerOpen: true })).toBeNull();
    expect(ask(3, { kitMode: true, setBannerOpen: true, state: start("kit3") })).toBeNull();
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
    expect(parseTourState(JSON.stringify({ off: false, seq: "kit2", step: 2 }))).toEqual({
      off: false,
      seq: null,
      step: 2,
    });
    expect(parseTourState(JSON.stringify({ off: false, seq: "normal", step: 1 }))).toEqual({
      off: false,
      seq: null,
      step: 1,
    });
  });

  it("round-trips a valid state", () => {
    const state: TourState = { off: false, seq: "kit3", step: 2 };
    expect(parseTourState(JSON.stringify(state))).toEqual(state);
  });
});

describe("turnOff — the ✕ is definitive", () => {
  it("sets off and keeps the rest of the state", () => {
    expect(turnOff(base({ seq: "kit3", step: 2 }))).toEqual({
      off: true,
      seq: "kit3",
      step: 2,
    });
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
    expect(start("step2")).toEqual({ off: false, seq: "step2", step: 1 });
    expect(start("kit3")).toEqual({ off: false, seq: "kit3", step: 1 });
  });
});
