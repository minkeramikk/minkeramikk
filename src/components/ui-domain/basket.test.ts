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
import {
  basketCta,
  explicitPickThumb,
  paintFirstHref,
  paintTargetFor,
} from "@/components/ui-domain/basket-host";
import type { Palette } from "@/lib/palettes/palettes";
import {
  decodeConfigCode,
  encodeConfigCode,
  type CodecDesign,
} from "@/lib/configurator/config-code";

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
 * R5-TEXT-CARRY task 2 (AC3) — the explicit pick carries the SAVED palette's
 * snapshot whole (colours AND dedication). The words on screen are ignored BY
 * CONSTRUCTION: `explicitPickThumb` takes only the palette, there is no
 * parameter the on-screen words could even arrive through — so "Trude" can
 * never come out as "Mons".
 */
describe("explicitPickThumb", () => {
  const selections = [
    { label: "Hovedfarge", option: "Blå", hex: "#1d4ed8" },
    { label: "Kant", option: "Hvit", hex: "#ffffff" },
  ];
  const layers = [{ src: "/layer.png", recolor: true as const }];
  const palette = (
    name: string,
    extra?: { customText?: string; customNote?: string },
    sels: { label: string; option: string; hex: string | null }[] = selections
  ): Palette => ({
    code: "T-BLAA-WITH-TRUDE",
    name,
    designSlug: "striper",
    snapshot: {
      designSlug: "striper",
      designName: "Striper",
      selections: sels,
      ...extra,
    },
    layers,
    createdAt: 1,
    usedAt: 2,
  });

  it("paints the palette's own dedication, never the words on screen", () => {
    // Same colours, palette says "Trude", the screen says "Mons".
    const out = explicitPickThumb(
      palette("Trude", { customText: "Trude", customNote: "mørkere blå" })
    );
    expect(out.code).toBe("T-BLAA-WITH-TRUDE");
    expect(out.layers).toEqual(layers);
    expect(out.label).toBe("Trude");
    expect(out.dedication).toBe("Trude");
    expect(out.snapshot.customText).toBe("Trude");
    expect(out.snapshot.customNote).toBe("mørkere blå");
    expect(out.hexes).toEqual(["#1d4ed8", "#ffffff"]);
    expect(out.selectionCount).toBe(2);
  });

  it("a palette without a dedication paints no words at all", () => {
    const out = explicitPickThumb(palette("Zaffera"));
    expect(out.dedication).toBeUndefined();
    expect("customText" in out.snapshot).toBe(false);
    expect(out.code).toBe("T-BLAA-WITH-TRUDE");
    expect(out.hexes).toEqual(["#1d4ed8", "#ffffff"]);
    expect(out.selectionCount).toBe(2);
  });

  it("drops selections without a hex from hexes, like rowThumb always did", () => {
    const out = explicitPickThumb(
      palette(
        "Trude",
        { customText: "Trude" },
        [
          { label: "Hovedfarge", option: "Blå", hex: "#1d4ed8" },
          { label: "Kant", option: "Ingen", hex: null },
        ]
      )
    );
    expect(out.hexes).toEqual(["#1d4ed8"]);
    expect(out.selectionCount).toBe(2);
  });
});

/**
 * R5-BASKET-HOST final review, finding 4a — «Paint N pieces first ›» from the
 * drawer. The bug was a target built from the config code alone; the rule
 * WAS that the code carries the COLOURS and the configuration on screen
 * carries the customer's own words.
 *
 * R5-TEXT-IDENTITY task 4 flips that rule for the inscription specifically:
 * the code now carries it too (`line-payload.ts`), «la push si porta la
 * dedica perché si porta il codice» — so this href no longer writes `text=`
 * at all. `note=` is unchanged: the colour WISH enters the code only as a
 * non-reversible hash, so the actual words still need the URL to reach the
 * rebuilt snapshot.
 */
describe("paintFirstHref", () => {
  const at = (qs: string) => new URLSearchParams(qs);
  const cfg = (code: string, snapshot: { customNote?: string } = {}) => ({
    code,
    snapshot,
  });

  // A tiny real catalog fixture — same pattern config-code.test.ts and
  // set-code.test.ts use — so "the inscription survives the push" is
  // checked against the REAL codec, not a placeholder string.
  const DESIGN: CodecDesign = {
    code: "T",
    slug: "text-design",
    categories: [
      { slug: "colors", optionCodeToId: { B: "colors-opt-b" }, defaultOptionId: "colors-opt-b" },
    ],
  };
  const findDesign = (code: string): CodecDesign | null =>
    code.toUpperCase() === DESIGN.code ? DESIGN : null;
  const SEL = { colors: "colors-opt-b" };

  it("the inscription survives the push THROUGH the code, never via text=", () => {
    const codeWithInscription = encodeConfigCode(DESIGN, SEL, {
      customText: "Til Åse",
    });
    const q = new URL(
      paintFirstHref(at("design=amalfi-dyr"), cfg(codeWithInscription)),
      "https://x"
    ).searchParams;
    expect(q.get("code")).toBe(codeWithInscription);
    expect(q.get("text")).toBeNull(); // never written — the code already has it
    expect(q.get("step")).toBe("3");
    // and it really is recoverable from that same code at the destination
    expect(decodeConfigCode(codeWithInscription, findDesign).customText).toBe(
      "Til Åse"
    );
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

  it("always drops a stale text= — the code is the only source of truth for it now", () => {
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
