import { describe, it, expect } from "vitest";
import { visualViewportInset } from "./visual-viewport";

describe("visualViewportInset", () => {
  it("is 0 when the visual viewport fills the layout viewport (no keyboard)", () => {
    expect(
      visualViewportInset({ innerHeight: 844, viewportHeight: 844, offsetTop: 0 })
    ).toBe(0);
  });

  it("equals the keyboard height when the viewport shrinks from the bottom", () => {
    // 844 layout, keyboard eats 300 → visual viewport 544, pinned at top
    expect(
      visualViewportInset({ innerHeight: 844, viewportHeight: 544, offsetTop: 0 })
    ).toBe(300);
  });

  it("accounts for offsetTop (pinch-zoom panned down)", () => {
    // inset = 844 - 544 - 100 = 200
    expect(
      visualViewportInset({ innerHeight: 844, viewportHeight: 544, offsetTop: 100 })
    ).toBe(200);
  });

  it("never returns a negative inset", () => {
    expect(
      visualViewportInset({ innerHeight: 844, viewportHeight: 900, offsetTop: 0 })
    ).toBe(0);
  });

  it("collapses sub-pixel noise (<= 1px) to 0", () => {
    expect(
      visualViewportInset({ innerHeight: 844, viewportHeight: 843.4, offsetTop: 0 })
    ).toBe(0);
  });
});
