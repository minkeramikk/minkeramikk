/**
 * R5-BASKET-HOST task 4 — the two decisions in `<Basket>` that are pure, and
 * the only two worth a standalone test (no React test infra in this repo, see
 * AGENTS.md/vitest.config.ts: vitest picks up `src/**` + `*.test.ts` only).
 *
 * Both are testid contracts twelve Playwright specs depend on, and nobody may
 * run those here — which is exactly why the branch that picks the testid is
 * pulled out of the JSX and pinned down in a unit test instead.
 */
import { describe, expect, it } from "vitest";
import { basketCta, paintTargetFor } from "@/components/ui-domain/basket-host";

describe("basketCta", () => {
  it("the column flips between its two testids", () => {
    expect(basketCta("column", 2)).toEqual({
      face: "paint",
      testId: "docked-paint-first",
    });
    expect(basketCta("column", 0)).toEqual({
      face: "checkout",
      testId: "docked-checkout",
    });
  });

  it("the drawer keeps ONE testid on both faces", () => {
    expect(basketCta("drawer", 3)).toEqual({ face: "paint", testId: "cart-checkout" });
    expect(basketCta("drawer", 0)).toEqual({
      face: "checkout",
      testId: "cart-checkout",
    });
  });

  it("counts pieces, so a single unpainted piece is still paint-first", () => {
    expect(basketCta("column", 1).face).toBe("paint");
  });
});

describe("paintTargetFor", () => {
  it("a configuration on screen means the row paints with a palette", () => {
    expect(paintTargetFor({ designSlug: "striper" })).toEqual({ kind: "palette" });
    // …whatever the line's own design is: the chip follows the screen.
    expect(paintTargetFor({ designSlug: "striper" }, "juletre")).toEqual({
      kind: "palette",
    });
  });

  it("no configuration → the chip is a link to step 2 on the known design", () => {
    expect(paintTargetFor(null, "juletre")).toEqual({
      kind: "none",
      href: "/configurator?design=juletre&step=2",
    });
  });

  it("no configuration and no design → the bare configurator", () => {
    expect(paintTargetFor(null)).toEqual({ kind: "none", href: "/configurator" });
    // An unpainted line carries no `configSnapshot` at all (cart.ts), so this
    // is the case the drawer at step 1 actually hits.
    expect(paintTargetFor(null, undefined)).toEqual({
      kind: "none",
      href: "/configurator",
    });
    expect(paintTargetFor(null, null)).toEqual({
      kind: "none",
      href: "/configurator",
    });
  });

  it("escapes a slug that needs it", () => {
    expect(paintTargetFor(null, "a b&c")).toEqual({
      kind: "none",
      href: "/configurator?design=a%20b%26c&step=2",
    });
  });
});
