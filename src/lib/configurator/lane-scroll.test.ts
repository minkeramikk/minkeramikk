import { describe, expect, it } from "vitest";
import { arrowStep, centreScrollLeft } from "./lane-scroll";

describe("arrowStep", () => {
  it("moves ~80% of the lane's viewport, in the asked direction", () => {
    expect(arrowStep(300, 1)).toBe(240);
    expect(arrowStep(300, -1)).toBe(-240);
  });
  it("never returns 0 for a lane with width", () => {
    expect(arrowStep(1, 1)).toBeGreaterThan(0);
  });
});

describe("centreScrollLeft", () => {
  const lane = { laneLeft: 0, laneScrollLeft: 0, laneClientWidth: 300 };

  it("centres a card that sits to the right of the viewport", () => {
    // card at x=400, 60 wide → centre it: 400 - (300-60)/2 = 280
    expect(centreScrollLeft({ ...lane, cardLeft: 400, cardWidth: 60 })).toBe(280);
  });

  it("accounts for the lane's current scroll position", () => {
    // same card, but the lane is already scrolled 100px: its rect left is 300
    expect(
      centreScrollLeft({ ...lane, laneScrollLeft: 100, cardLeft: 300, cardWidth: 60 })
    ).toBe(280);
  });

  it("never scrolls past the left edge", () => {
    expect(centreScrollLeft({ ...lane, cardLeft: 0, cardWidth: 60 })).toBe(0);
  });

  it("is a no-op when the card is already centred", () => {
    expect(centreScrollLeft({ ...lane, cardLeft: 120, cardWidth: 60 })).toBe(0);
  });
});
