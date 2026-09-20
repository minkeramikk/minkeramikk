import { describe, expect, it } from "vitest";
import { fitRatio, INSCRIPTION_MIN_FIT, showsLiveInscription } from "./inscription";

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

describe("fitRatio", () => {
  it("leaves a line that already fits at full size", () => {
    expect(fitRatio(100, 200)).toBe(1);
    expect(fitRatio(200, 200)).toBe(1);
  });

  it("shrinks proportionally: width is linear in font size", () => {
    expect(fitRatio(400, 200)).toBe(0.5);
  });

  it("stops shrinking at the floor — below it the line truncates (AC 3)", () => {
    expect(fitRatio(4000, 200)).toBe(INSCRIPTION_MIN_FIT);
  });

  it("survives a measurement taken before layout (0, NaN)", () => {
    expect(fitRatio(0, 200)).toBe(1);
    expect(fitRatio(100, 0)).toBe(1);
    expect(fitRatio(Number.NaN, 200)).toBe(1);
  });
});
