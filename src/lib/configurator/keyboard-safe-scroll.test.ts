import { describe, expect, it } from "vitest";
import { keyboardSafeScrollDelta } from "./keyboard-safe-scroll";

// iPhone-ish, keyboard up: the visual viewport is 300px tall. The canvas has
// released its `sticky` (see the focus handler), so the only thing occupying
// the top is the 56px ink header.
const kb = { viewportTop: 0, viewportHeight: 300, marginTop: 56, marginBottom: 12 };
// free strip = 56 → 288

describe("keyboardSafeScrollDelta", () => {
  it("is 0 when the field already sits in the free strip", () => {
    expect(keyboardSafeScrollDelta({ ...kb, fieldTop: 100, fieldBottom: 142 })).toBe(0);
  });

  it("scrolls DOWN when the keyboard covers the field", () => {
    // bottom 362 overruns 288 by 74; the field's top has 264px of room, so the
    // full 74 is safe to take
    expect(keyboardSafeScrollDelta({ ...kb, fieldTop: 320, fieldBottom: 362 })).toBe(74);
  });

  it("scrolls UP when the field is above the free strip", () => {
    // top 20 is 36px above safeTop 56 → move the page up by 36
    expect(keyboardSafeScrollDelta({ ...kb, fieldTop: 20, fieldBottom: 62 })).toBe(-36);
  });

  it("prefers showing the TOP of a field taller than the free strip", () => {
    // a 300px field in a 232px strip: bottom overruns by 112, but taking all of
    // it would push the top 68px above the strip — cap at what the top allows
    expect(
      keyboardSafeScrollDelta({ ...kb, fieldTop: 100, fieldBottom: 400 })
    ).toBe(44);
  });

  it("accounts for a visual viewport that is offset from the layout one", () => {
    // the page is already scrolled 100px: the same field is 100px higher in
    // visual coordinates, so the correction shrinks by exactly 100
    expect(
      keyboardSafeScrollDelta({ ...kb, viewportTop: 100, fieldTop: 420, fieldBottom: 462 })
    ).toBe(74);
  });
});
