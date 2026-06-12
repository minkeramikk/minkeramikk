import { describe, it, expect } from "vitest";
import {
  nextFloatState,
  FLOAT_INITIAL,
  FLOAT_DEFAULTS,
  type FloatState,
} from "./float-visibility";

/** Run a sequence of [ratio, atMs] ticks and return the trace of `visible`. */
function run(seq: [number, number][], from: FloatState = FLOAT_INITIAL) {
  const states: FloatState[] = [];
  let s = from;
  for (const [ratio, at] of seq) {
    s = nextFloatState(s, ratio, at);
    states.push(s);
  }
  return { final: states[states.length - 1], trace: states.map((x) => x.visible) };
}

describe("nextFloatState — show path", () => {
  it("stays hidden while the preview is visible", () => {
    const { final } = run([
      [1, 0],
      [0.8, 100],
      [0.6, 200],
    ]);
    expect(final.visible).toBe(false);
    expect(final.pendingShowSince).toBeNull();
  });

  it("shows only after the ratio sits below the threshold for the stability window", () => {
    const { trace } = run([
      [0.05, 0], // enters the candidate zone → clock starts
      [0.05, 100], // 100ms < 150ms → still hidden
      [0.05, 160], // window elapsed → SHOW
    ]);
    expect(trace).toEqual([false, false, true]);
  });

  it("a churn spike that leaves the zone RESTARTS the clock (no premature show)", () => {
    const { trace } = run([
      [0.05, 0], // clock starts
      [0.2, 80], // URL-bar spike: out of the zone → reset
      [0.05, 100], // clock restarts
      [0.05, 200], // only 100ms since restart → hidden
      [0.05, 260], // 160ms since restart → SHOW
    ]);
    expect(trace).toEqual([false, false, false, false, true]);
  });

  it("the dead zone (between thresholds) never shows, however long", () => {
    const { final } = run([
      [0.3, 0],
      [0.2, 500],
      [0.45, 5000],
    ]);
    expect(final.visible).toBe(false);
  });
});

describe("nextFloatState — hide path & hysteresis", () => {
  const visible: FloatState = { visible: true, pendingShowSince: null };

  it("hides immediately when the preview is clearly back", () => {
    expect(nextFloatState(visible, 0.6, 0).visible).toBe(false);
  });

  it("stays visible through the WHOLE dead zone (the hysteresis core)", () => {
    const { trace } = run(
      [
        [0.15, 0],
        [0.3, 100],
        [0.49, 200],
        [0.05, 300],
      ],
      visible
    );
    expect(trace).toEqual([true, true, true, true]);
  });

  it("URL-bar churn around the show threshold cannot flip a visible bubble", () => {
    // ratios oscillating 0 ↔ 0.15 like a resizing viewport
    const seq: [number, number][] = Array.from({ length: 20 }, (_, i) => [
      i % 2 === 0 ? 0 : 0.15,
      i * 50,
    ]);
    const { trace } = run(seq, visible);
    expect(new Set(trace)).toEqual(new Set([true])); // never hid
  });

  it("URL-bar churn around the hide threshold cannot flip a hidden bubble", () => {
    // oscillating 0.45 ↔ 0.6 — crosses hideAbove but the bubble is hidden
    const seq: [number, number][] = Array.from({ length: 20 }, (_, i) => [
      i % 2 === 0 ? 0.45 : 0.6,
      i * 50,
    ]);
    const { trace } = run(seq);
    expect(new Set(trace)).toEqual(new Set([false])); // never showed
  });

  it("full ride: scroll down (show), drift in dead zone, scroll back (hide)", () => {
    const { trace } = run([
      [0.05, 0],
      [0.05, 200], // show
      [0.2, 300], // dead zone → stays
      [0.4, 400], // dead zone → stays
      [0.7, 500], // clearly back → hide
      [0.4, 600], // dead zone → stays hidden
    ]);
    expect(trace).toEqual([false, true, true, true, false, false]);
  });
});

describe("defaults sanity", () => {
  it("thresholds are asymmetric with a real dead zone", () => {
    expect(FLOAT_DEFAULTS.hideAbove).toBeGreaterThan(FLOAT_DEFAULTS.showBelow);
    expect(FLOAT_DEFAULTS.hideAbove - FLOAT_DEFAULTS.showBelow).toBeGreaterThanOrEqual(0.3);
    expect(FLOAT_DEFAULTS.showDelayMs).toBeGreaterThan(0);
  });
});
