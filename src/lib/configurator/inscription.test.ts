import { describe, expect, it } from "vitest";
import {
  INSCRIPTION_MAX_LINES,
  INSCRIPTION_MIN_FIT,
  INSCRIPTION_SCALE_LONG,
  INSCRIPTION_SCALE_SHORT,
  INSCRIPTION_SHORT,
  INSCRIPTION_SHRINK_STEP,
  scaleForLength,
  showsLiveInscription,
  shrinkStep,
} from "./inscription";
import { MAX_CUSTOM_TEXT } from "@/lib/orders/schema";

const textGroup = {
  slug: "tekst",
  labelNo: "Tekst",
  labelEn: "Text",
  options: [{ id: "none" }, { id: "tekst-1" }, { id: "tekst-2" }],
};

const base = {
  acceptsCustomText: true,
  textGroup: null,
  selectedOptionId: undefined,
  text: "Til Kari",
};

describe("showsLiveInscription", () => {
  it("draws the words on a design that has no text group (AC 1)", () => {
    expect(showsLiveInscription(base)).toBe(true);
  });

  it("stays away where the studio already painted the word (AC 2)", () => {
    // Krabbe con «Tekst 1»: il layer disegna già una parola, due sarebbero un bug
    expect(
      showsLiveInscription({ ...base, textGroup, selectedOptionId: "tekst-1" })
    ).toBe(false);
  });

  it("stays away on the same design with «no text» selected", () => {
    expect(
      showsLiveInscription({ ...base, textGroup, selectedOptionId: "none" })
    ).toBe(false);
  });

  it("stays away when the design does not accept an inscription at all", () => {
    expect(showsLiveInscription({ ...base, acceptsCustomText: false })).toBe(false);
  });

  it("draws nothing for an empty field, or for spaces alone", () => {
    expect(showsLiveInscription({ ...base, text: "" })).toBe(false);
    expect(showsLiveInscription({ ...base, text: "   " })).toBe(false);
  });
});

describe("scaleForLength", () => {
  it("gives a short dedication the bonus — poche lettere, carattere più grande", () => {
    expect(scaleForLength(1)).toBe(INSCRIPTION_SCALE_SHORT);
    expect(scaleForLength(INSCRIPTION_SHORT)).toBe(INSCRIPTION_SCALE_SHORT);
    expect(INSCRIPTION_SCALE_SHORT).toBeGreaterThan(1);
  });

  it("comes down in a straight line to the floor at the field's cap", () => {
    expect(scaleForLength(MAX_CUSTOM_TEXT)).toBeCloseTo(INSCRIPTION_SCALE_LONG, 10);
    const mid = (INSCRIPTION_SHORT + MAX_CUSTOM_TEXT) / 2;
    expect(scaleForLength(mid)).toBeCloseTo(
      (INSCRIPTION_SCALE_SHORT + INSCRIPTION_SCALE_LONG) / 2,
      10
    );
  });

  it("never goes below the floor, whatever arrives", () => {
    expect(scaleForLength(MAX_CUSTOM_TEXT + 100)).toBeCloseTo(
      INSCRIPTION_SCALE_LONG,
      10
    );
  });

  it("only ever shrinks as the text grows", () => {
    for (let n = 1; n < MAX_CUSTOM_TEXT; n++) {
      expect(scaleForLength(n + 1)).toBeLessThanOrEqual(scaleForLength(n));
    }
  });

  it("stays above the fit floor, or the loop could never take a step", () => {
    expect(INSCRIPTION_MIN_FIT).toBeLessThan(INSCRIPTION_SCALE_LONG);
  });
});

describe("shrinkStep", () => {
  it("stops as soon as the block fits", () => {
    expect(shrinkStep(1, { tooWide: false, lines: INSCRIPTION_MAX_LINES })).toBeNull();
    expect(shrinkStep(1, { tooWide: false, lines: 1 })).toBeNull();
  });

  it("takes a step when the block runs to one line too many", () => {
    expect(
      shrinkStep(1, { tooWide: false, lines: INSCRIPTION_MAX_LINES + 1 })
    ).toBeCloseTo(INSCRIPTION_SHRINK_STEP, 10);
  });

  it("takes a step for a single word wider than the box, however few the lines", () => {
    expect(shrinkStep(1, { tooWide: true, lines: 1 })).toBeCloseTo(
      INSCRIPTION_SHRINK_STEP,
      10
    );
  });

  it("lands exactly on the floor instead of going under it", () => {
    const justAbove = INSCRIPTION_MIN_FIT / INSCRIPTION_SHRINK_STEP;
    expect(shrinkStep(justAbove, { tooWide: true, lines: 9 })).toBe(
      INSCRIPTION_MIN_FIT
    );
  });

  it("gives up at the floor — da lì in giù si tronca (AC 3)", () => {
    expect(shrinkStep(INSCRIPTION_MIN_FIT, { tooWide: true, lines: 9 })).toBeNull();
  });

  it("always terminates: from the top it reaches the floor in a bounded walk", () => {
    let fit = INSCRIPTION_SCALE_SHORT;
    let steps = 0;
    for (;;) {
      const next = shrinkStep(fit, { tooWide: true, lines: 9 });
      if (next === null) break;
      expect(next).toBeLessThan(fit);
      fit = next;
      steps++;
      expect(steps).toBeLessThan(100);
    }
    expect(fit).toBe(INSCRIPTION_MIN_FIT);
  });
});
