import { describe, it, expect } from "vitest";
import { basketOpen } from "./basket-open";

/**
 * R5-BASKET-HOST task 8 — the keyboard guard, card §3. The four cases are the
 * whole rule: what a request does, what the keyboard does to a request, what
 * it does to an open basket, and — the one a naive guard gets wrong — what
 * happens when the keyboard goes away again.
 */
describe("basketOpen", () => {
  it("opens on request when nothing is in the way", () => {
    expect(basketOpen({ current: false, request: true, typing: false })).toBe(true);
  });

  it("closes on request", () => {
    expect(basketOpen({ current: true, request: false, typing: false })).toBe(false);
  });

  it("drops a request to open made while typing", () => {
    expect(basketOpen({ current: false, request: true, typing: true })).toBe(false);
  });

  it("closes a basket that is already open when typing starts", () => {
    expect(basketOpen({ current: true, typing: true })).toBe(false);
  });

  it("does not reopen by itself when typing ends", () => {
    // The dropped request is not remembered anywhere: re-deciding with the
    // keyboard gone answers from the CURRENT state, which is still closed.
    const afterTheDroppedTap = basketOpen({ current: false, request: true, typing: true });
    expect(basketOpen({ current: afterTheDroppedTap, typing: false })).toBe(false);
  });

  it("leaves an open basket open when typing ends", () => {
    expect(basketOpen({ current: true, typing: false })).toBe(true);
  });

  it("can always be closed, keyboard or not", () => {
    expect(basketOpen({ current: true, request: false, typing: true })).toBe(false);
  });
});
