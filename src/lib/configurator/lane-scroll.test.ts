import { describe, expect, it } from "vitest";
import { ARROW_SAFE_PX, arrowStep, centreScrollLeft, nearestScrollLeft } from "./lane-scroll";

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

describe("nearestScrollLeft", () => {
  // scroller largo 366 con i due dischi ai bordi: fascia libera 48..318
  const bar = {
    scrollerLeft: 12,
    clientWidth: 366,
    padStart: ARROW_SAFE_PX,
    padEnd: ARROW_SAFE_PX,
  };

  it("non muove niente quando il target è già nella fascia libera", () => {
    // target a 100..180 in viewport → offset 88..168, dentro 48..318
    expect(
      nearestScrollLeft({ ...bar, scrollLeft: 0, targetLeft: 100, targetWidth: 80 })
    ).toBe(0);
  });

  it("tira dentro un target che riposa sotto il disco di sinistra", () => {
    // il caso misurato: il tab riposa a x=12, cioè offset 0, sotto il ‹
    expect(
      nearestScrollLeft({ ...bar, scrollLeft: 242, targetLeft: 12, targetWidth: 124 })
    ).toBe(242 - 48);
  });

  it("tira dentro un target che sborda sotto il disco di destra", () => {
    // target 290..407 in viewport, scrollLeft 0 → offset 278..395; la fascia
    // finisce a 318, quindi serve 395 - 366 + 48 = 77
    expect(
      nearestScrollLeft({ ...bar, scrollLeft: 0, targetLeft: 290, targetWidth: 117 })
    ).toBe(77);
  });

  it("non scrolla mai oltre il bordo sinistro", () => {
    expect(
      nearestScrollLeft({ ...bar, scrollLeft: 0, targetLeft: 12, targetWidth: 80 })
    ).toBe(0);
  });

  it("su un target più largo della fascia libera allinea il bordo INIZIALE", () => {
    // 300px di target in una fascia da 270: non ci sta, vince l'inizio
    expect(
      nearestScrollLeft({ ...bar, scrollLeft: 0, targetLeft: 200, targetWidth: 300 })
    ).toBe(188 - 48);
  });
});
