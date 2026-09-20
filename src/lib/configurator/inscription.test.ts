import { describe, expect, it } from "vitest";
import {
  fitRatio,
  INSCRIPTION_FIT_SLACK,
  INSCRIPTION_MIN_FIT,
  INSCRIPTION_TAPER_FROM,
  INSCRIPTION_TAPER_TO,
  showsLiveInscription,
  taperForLength,
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

describe("taperForLength", () => {
  it("leaves a short dedication at full size", () => {
    expect(taperForLength(1)).toBe(1);
    expect(taperForLength(INSCRIPTION_TAPER_FROM)).toBe(1);
  });

  it("comes down in a straight line to the floor at the field's cap", () => {
    expect(taperForLength(MAX_CUSTOM_TEXT)).toBeCloseTo(INSCRIPTION_TAPER_TO, 10);
    const mid = (INSCRIPTION_TAPER_FROM + MAX_CUSTOM_TEXT) / 2;
    expect(taperForLength(mid)).toBeCloseTo((1 + INSCRIPTION_TAPER_TO) / 2, 10);
  });

  it("never goes below the floor, whatever arrives", () => {
    expect(taperForLength(MAX_CUSTOM_TEXT + 100)).toBeCloseTo(
      INSCRIPTION_TAPER_TO,
      10
    );
  });

  it("only ever shrinks as the text grows", () => {
    for (let n = 1; n < MAX_CUSTOM_TEXT; n++) {
      expect(taperForLength(n + 1)).toBeLessThanOrEqual(taperForLength(n));
    }
  });
});

describe("fitRatio", () => {
  it("leaves a short line that already fits at full size", () => {
    expect(fitRatio(100, 200, 8)).toBe(1);
  });

  it("backs off a line that fills the box exactly", () => {
    // è il caso che produce i tre puntini: largo quanto la scatola al decimo
    // di pixel, e un arrotondamento altrove se ne mangia le ultime lettere
    expect(fitRatio(200, 200, 8)).toBeCloseTo(INSCRIPTION_FIT_SLACK, 10);
  });

  it("shrinks proportionally when the line hits the wall, minus the slack", () => {
    // 8 caratteri: la rampa non è ancora partita, decide solo la larghezza
    expect(fitRatio(400, 200, 8)).toBeCloseTo(0.5 * INSCRIPTION_FIT_SLACK, 10);
  });

  it("never lands EXACTLY on the wall — è lì che nascono i tre puntini", () => {
    expect(fitRatio(400, 200, 8)).toBeLessThan(0.5);
  });

  it("takes the length ramp when it is stricter than the wall", () => {
    // una riga che nella scatola ci starebbe, ma è lunga: scende comunque
    expect(fitRatio(100, 200, MAX_CUSTOM_TEXT)).toBeCloseTo(
      INSCRIPTION_TAPER_TO,
      10
    );
  });

  it("takes the wall when IT is the stricter of the two", () => {
    // rampa a 0,7 ma la scatola ne concede 0,5: comanda la scatola (AC 3)
    expect(fitRatio(400, 200, MAX_CUSTOM_TEXT)).toBeCloseTo(
      0.5 * INSCRIPTION_FIT_SLACK,
      10
    );
  });

  it("stops shrinking at the floor — below it the line truncates (AC 3)", () => {
    expect(fitRatio(4000, 200, 8)).toBe(INSCRIPTION_MIN_FIT);
  });

  it("survives a measurement taken before layout (0, NaN): stays on the ramp", () => {
    expect(fitRatio(0, 200, 8)).toBe(1);
    expect(fitRatio(100, 0, 8)).toBe(1);
    expect(fitRatio(Number.NaN, 200, 8)).toBe(1);
    expect(fitRatio(0, 200, MAX_CUSTOM_TEXT)).toBeCloseTo(INSCRIPTION_TAPER_TO, 10);
  });
});
