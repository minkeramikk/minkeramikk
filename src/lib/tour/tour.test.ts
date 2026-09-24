import { describe, it, expect } from "vitest";
import {
  TOUR_DEFAULT,
  TOUR_KEY,
  next,
  parseTourState,
  start,
  tipFor,
  turnOff,
  type TourState,
} from "./tour";

/**
 * R5-TUTORIAL — the pure domain `tipFor` is what AC1-3 actually test (card):
 * the components that consume it just render whatever it returns. See
 * `.plans/r5-tutorial.md` §0.1-3.
 */

const base = (over: Partial<TourState> = {}): TourState => ({
  ...TOUR_DEFAULT,
  ...over,
});

const norm = (step: 1 | 2 | 3, state: TourState = TOUR_DEFAULT) =>
  tipFor({
    state,
    hydrated: true,
    kitMode: false,
    welcomeOpen: false,
    setBannerOpen: false,
    step,
  });

describe("TOUR_KEY", () => {
  it("is the localStorage key the card asks for (definitive, per visitor)", () => {
    expect(TOUR_KEY).toBe("mk-tips-v1");
  });
});

describe("tipFor — AC1 normal tour", () => {
  it("shows the passo-1 tip on step 1", () => {
    expect(norm(1)).toEqual({ sequence: "normal", n: 1 });
  });

  it("shows the passo-2 tip on step 2", () => {
    expect(norm(2)).toEqual({ sequence: "normal", n: 2 });
  });

  it("shows the passo-3 tip on step 3", () => {
    expect(norm(3)).toEqual({ sequence: "normal", n: 3 });
  });

  it("shows nothing once off", () => {
    expect(norm(1, base({ off: true }))).toBeNull();
    expect(norm(2, base({ off: true }))).toBeNull();
    expect(norm(3, base({ off: true }))).toBeNull();
  });

  it("shows nothing before hydration", () => {
    expect(
      tipFor({
        state: TOUR_DEFAULT,
        hydrated: false,
        kitMode: false,
        welcomeOpen: false,
        setBannerOpen: false,
        step: 1,
      })
    ).toBeNull();
  });
});

describe("turnOff — AC1 the ✕ is definitive", () => {
  it("sets off and keeps the rest of the state", () => {
    expect(turnOff(base({ seq: "kit2", step: 2 }))).toEqual({
      off: true,
      seq: "kit2",
      step: 2,
    });
  });

  it("survives a serialize/parse round trip (the reload in AC1)", () => {
    const off = turnOff(TOUR_DEFAULT);
    const roundTripped = parseTourState(JSON.stringify(off));
    expect(roundTripped).toEqual(off);
    expect(norm(1, roundTripped)).toBeNull();
  });
});

describe("tipFor — AC2 kit: step 2 (kit2) then step 3 (kit3)", () => {
  it("welcome open → no tip at all, even in kit-mode", () => {
    expect(
      tipFor({
        state: TOUR_DEFAULT,
        hydrated: true,
        kitMode: true,
        welcomeOpen: true,
        setBannerOpen: false,
        step: 2,
      })
    ).toBeNull();
  });

  it("a kit never lands a tour on step 1", () => {
    expect(
      tipFor({
        state: start("kit2"),
        hydrated: true,
        kitMode: true,
        welcomeOpen: false,
        setBannerOpen: false,
        step: 1,
      })
    ).toBeNull();
  });

  it("walks kit2 1 → 2 → 3, then hands off to kit3 1 → 2 → 3, then off", () => {
    const tip2 = (state: TourState) =>
      tipFor({
        state,
        hydrated: true,
        kitMode: true,
        welcomeOpen: false,
        setBannerOpen: false,
        step: 2,
      });
    const tip3 = (state: TourState) =>
      tipFor({
        state,
        hydrated: true,
        kitMode: true,
        welcomeOpen: false,
        setBannerOpen: false,
        step: 3,
      });

    // «Show me how» → kit2 starts at 1
    let state = start("kit2");
    expect(tip2(state)).toEqual({ sequence: "kit2", n: 1 });

    state = next(state, "kit2");
    expect(tip2(state)).toEqual({ sequence: "kit2", n: 2 });

    state = next(state, "kit2");
    expect(tip2(state)).toEqual({ sequence: "kit2", n: 3 });

    // last kit2 Next hands off to kit3/1 without turning off
    state = next(state, "kit2");
    expect(state.off).toBe(false);
    expect(tip3(state)).toEqual({ sequence: "kit3", n: 1 });

    state = next(state, "kit3");
    expect(tip3(state)).toEqual({ sequence: "kit3", n: 2 });

    state = next(state, "kit3");
    expect(tip3(state)).toEqual({ sequence: "kit3", n: 3 });

    // last kit3 Next (Done) turns tips off for good
    state = next(state, "kit3");
    expect(state.off).toBe(true);
    expect(tip3(state)).toBeNull();
  });

  it("390: kit3's coach bar rides the sheet regardless of step number reported (n is 1-3)", () => {
    const state = start("kit3");
    const tip = tipFor({
      state,
      hydrated: true,
      kitMode: true,
      welcomeOpen: false,
      setBannerOpen: false,
      step: 3,
    });
    expect(tip?.sequence).toBe("kit3");
    expect(tip?.n).toBe(1);
  });
});

describe("tipFor — AC3 set: no tour", () => {
  it("shows nothing while the set banner is on screen, in or out of kit-mode", () => {
    expect(
      tipFor({
        state: TOUR_DEFAULT,
        hydrated: true,
        kitMode: false,
        welcomeOpen: false,
        setBannerOpen: true,
        step: 3,
      })
    ).toBeNull();
    expect(
      tipFor({
        state: start("kit3"),
        hydrated: true,
        kitMode: true,
        welcomeOpen: false,
        setBannerOpen: true,
        step: 3,
      })
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

  it("round-trips a valid state", () => {
    const state: TourState = { off: false, seq: "kit3", step: 2 };
    expect(parseTourState(JSON.stringify(state))).toEqual(state);
  });
});

describe("start", () => {
  it("always begins a sequence at step 1 with tips on", () => {
    expect(start("kit2")).toEqual({ off: false, seq: "kit2", step: 1 });
    expect(start("normal")).toEqual({ off: false, seq: "normal", step: 1 });
  });
});
