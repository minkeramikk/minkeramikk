import { describe, it, expect } from "vitest";
import { basketOpen, keyboardUp, openOnKitArrival } from "./basket-open";

/**
 * R5-BASKET-HOST task 8 — the keyboard guard, card §3. The four cases are the
 * whole rule: what a request does, what the keyboard does to a request, what
 * it does to an open basket, and — the one a naive guard gets wrong — what
 * happens when the keyboard goes away again.
 */
describe("basketOpen", () => {
  it("opens on request when nothing is in the way", () => {
    expect(basketOpen({ current: false, request: true, keyboardIsUp: false })).toBe(true);
  });

  it("closes on request", () => {
    expect(basketOpen({ current: true, request: false, keyboardIsUp: false })).toBe(false);
  });

  it("drops a request to open made while typing", () => {
    expect(basketOpen({ current: false, request: true, keyboardIsUp: true })).toBe(false);
  });

  it("closes a basket that is already open when typing starts", () => {
    expect(basketOpen({ current: true, keyboardIsUp: true })).toBe(false);
  });

  it("does not reopen by itself when typing ends", () => {
    // The dropped request is not remembered anywhere: re-deciding with the
    // keyboard gone answers from the CURRENT state, which is still closed.
    const afterTheDroppedTap = basketOpen({ current: false, request: true, keyboardIsUp: true });
    expect(basketOpen({ current: afterTheDroppedTap, keyboardIsUp: false })).toBe(false);
  });

  it("leaves an open basket open when typing ends", () => {
    expect(basketOpen({ current: true, keyboardIsUp: false })).toBe(true);
  });

  it("can always be closed, keyboard or not", () => {
    expect(basketOpen({ current: true, request: false, keyboardIsUp: true })).toBe(false);
  });
});

describe("keyboardUp", () => {
  it("is up while the step-2 Text field has focus", () => {
    expect(keyboardUp({ step: 2, typing: true })).toBe(true);
  });

  it("is down at step 2 with nothing focused", () => {
    expect(keyboardUp({ step: 2, typing: false })).toBe(false);
  });

  it("is down at step 1 even when `typing` latched true", () => {
    // The «Tilbake» gesture: the button prevents the blur on purpose, then the
    // step-1 render unmounts the focused input — so `typing` never comes back
    // down. Publishing it as-is would leave step 1 with a permanently shut
    // basket, and on step 1 the drawer is the only basket there is.
    expect(keyboardUp({ step: 1, typing: true })).toBe(false);
    // …which is exactly what stops `basketOpen` from answering «never»:
    expect(basketOpen({ current: false, request: true, keyboardIsUp: keyboardUp({ step: 1, typing: true }) })).toBe(true);
  });
});

describe("openOnKitArrival", () => {
  it("opens in kit-mode with unpainted pieces below lg", () => {
    expect(openOnKitArrival({ kitMode: true, unpainted: 3, wide: false })).toBe(true);
  });

  it("stays shut on desktop (the rail is already the basket)", () => {
    expect(openOnKitArrival({ kitMode: true, unpainted: 3, wide: true })).toBe(false);
  });

  it("stays shut with nothing unpainted", () => {
    expect(openOnKitArrival({ kitMode: true, unpainted: 0, wide: false })).toBe(false);
  });

  it("stays shut outside kit-mode", () => {
    expect(openOnKitArrival({ kitMode: false, unpainted: 3, wide: false })).toBe(false);
  });
});
