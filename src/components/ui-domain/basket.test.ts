/**
 * R5-BASKET-HOST — the decisions the basket hosts make that are pure
 * functions of their inputs (`basket-host.ts`), which is all this repo can
 * test directly: there is no React test infra here (AGENTS.md /
 * vitest.config.ts — vitest picks up `src/**` + `*.test.ts` only).
 *
 * `basketCta` and `paintTargetFor` are testid/href contracts twelve
 * Playwright specs depend on, and nobody may run those here — which is
 * exactly why the branches are pulled out of the JSX and pinned down here.
 * `paintFirstHref` joined them in the final review: it decides which
 * configuration the customer keeps, and a wrong answer reaches the order
 * mail.
 */
import { describe, expect, it } from "vitest";
import { basketCta, paintFirstHref, paintTargetFor } from "@/components/ui-domain/basket-host";

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

  it("no configuration → the chip is a link to step 2 on the design in hand", () => {
    // Finding 5: this is the case the drawer at step 1/2 actually hits now.
    // The slug never comes from the LINE — an unpainted line has no
    // `configSnapshot` at all (cart.ts) — it is `Basket`'s
    // `fallbackDesignSlug`, read off the URL the drawer is open over. Before
    // the fix this branch was unreachable and every chip pointed at the bare
    // configurator.
    expect(paintTargetFor(null, "juletre")).toEqual({
      kind: "none",
      href: "/configurator?design=juletre&step=2",
    });
  });

  it("no configuration and no design at all → the bare configurator", () => {
    // Only reachable where the URL names no design either — the drawer
    // opened over `/order` or the basket page, not over the configurator.
    expect(paintTargetFor(null)).toEqual({ kind: "none", href: "/configurator" });
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

/**
 * R5-BASKET-HOST final review, finding 4a — «Paint N pieces first ›» from the
 * drawer. The bug was a target built from the config code alone; the rule is
 * that the code carries the COLOURS and the configuration on screen carries
 * the customer's own words.
 */
describe("paintFirstHref", () => {
  const at = (qs: string) => new URLSearchParams(qs);
  const cfg = (code: string, snapshot: { customNote?: string; customText?: string } = {}) => ({
    code,
    snapshot,
  });

  it("carries the inscription the config code cannot encode", () => {
    // The real step-2 case: nothing in the query yet, the words are still in
    // component state and only `currentConfig` knows them.
    const q = new URL(
      paintFirstHref(at("design=amalfi-dyr"), cfg("AB12", { customText: "Til Åse" })),
      "https://x"
    ).searchParams;
    expect(q.get("text")).toBe("Til Åse");
    expect(q.get("code")).toBe("AB12");
    expect(q.get("step")).toBe("3");
  });

  it("writes the note only when there is one, exactly like goToStep", () => {
    const withNote = new URL(
      paintFirstHref(at(""), cfg("AB12", { customNote: " brun hund " })),
      "https://x"
    ).searchParams;
    expect(withNote.get("note")).toBe("brun hund");
    // Default mode publishes `customNote: ""` — that is "studio's choice",
    // not a note, so it must not ride the URL.
    const studio = new URL(
      paintFirstHref(at("note=stale"), cfg("AB12", { customNote: "" })),
      "https://x"
    ).searchParams;
    expect(studio.get("note")).toBeNull();
  });

  it("clears a stale text= the configuration no longer has", () => {
    const q = new URL(paintFirstHref(at("text=old"), cfg("AB12")), "https://x").searchParams;
    expect(q.get("text")).toBeNull();
  });

  it("keeps the rest of the query it was standing on", () => {
    const q = new URL(
      paintFirstHref(at("origin=set&utm_source=mail"), cfg("AB12")),
      "https://x"
    ).searchParams;
    expect(q.get("origin")).toBe("set");
    expect(q.get("utm_source")).toBe("mail");
  });

  it("drops what the code supersedes, so nothing is ambiguous about which wins", () => {
    const q = new URL(
      paintFirstHref(at("design=striper&opt_farge=o1&opt_kant=o9&step=2"), cfg("AB12")),
      "https://x"
    ).searchParams;
    expect(q.get("design")).toBeNull();
    expect([...q.keys()].filter((k) => k.startsWith("opt_"))).toEqual([]);
  });

  it("is NOT a no-op at step 3 — it rewrites the query", () => {
    expect(paintFirstHref(at("design=striper&step=3"), cfg("AB12"))).not.toContain("design=");
  });

  it("no configuration on screen (the drawer at step 1) → the bare configurator", () => {
    expect(paintFirstHref(at("design=striper&text=Hei"), null)).toBe("/configurator");
    expect(paintFirstHref(null, null)).toBe("/configurator");
  });

  it("escapes a code that needs it", () => {
    expect(paintFirstHref(at(""), cfg("A B&C"))).toBe("/configurator?code=A+B%26C&step=3");
  });
});
