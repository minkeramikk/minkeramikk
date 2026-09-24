import { describe, it, expect } from "vitest";
import { positionLine } from "./lab-pdf";

/**
 * R5-TEXT-POSITION AC4 — `positionLine` is the pure piece the lab PDF's JSX
 * consumes for its always-present "POSITION: …" line (unlike the customer
 * PDF/mail, the workshop has no preview to fall back on, so `centre` gets a
 * line too). No PDF render here — that's `lab-pdf.server.test.ts` territory
 * if it ever exists; this only tests the four-way mapping.
 */
describe("positionLine", () => {
  it("centre — a straight line inside the inner ring", () => {
    expect(positionLine("centre")).toEqual({
      label: "CENTRE",
      note: "straight line inside the inner ring",
    });
  });

  it("top — the arc, as previewed", () => {
    expect(positionLine("top")).toEqual({
      label: "TOP",
      note: "arc along the upper inner ring, as previewed",
    });
  });

  it("bottom — the same arc, mirrored", () => {
    expect(positionLine("bottom")).toEqual({
      label: "BOTTOM",
      note: "same arc, mirrored",
    });
  });

  it("back — no preview to point to", () => {
    expect(positionLine("back")).toEqual({
      label: "BACK",
      note: "on the back, no preview",
    });
  });
});
