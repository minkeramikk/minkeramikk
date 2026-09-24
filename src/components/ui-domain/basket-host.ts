/**
 * R5-BASKET-HOST task 4 — the two decisions `<Basket>` makes that are pure
 * functions of its inputs, kept OUT of `basket.tsx` so a unit test can reach
 * them: importing the component drags `OrderForm` → next-intl's client
 * navigation in, which does not resolve outside Next's own bundler (this repo
 * has no React test infra — see AGENTS.md/vitest.config.ts).
 *
 * `basket.tsx` re-exports both, so nothing else has to know they live here.
 */
import type { CartLayer, ConfigSnapshot } from "@/lib/cart/cart";
import type { TextPosition } from "@/lib/configurator/text-position";
import type { Palette } from "@/lib/palettes/palettes";
/** Where this basket is mounted: the header drawer, or step 3's right column
 *  — which from PR 2 exists only from `lg` (its mobile in-flow twin, also a
 *  `"column"`, was deleted there). */
export type BasketHost = "column" | "drawer";

/**
 * Task 4 — the CTA is ONE decision rendered twice. While anything is
 * unpainted the order pill is REPLACED (not disabled) by the tertiary «Paint
 * N pieces first ›»; otherwise it opens the checkout form in place. The
 * testid is the only thing the host changes, and twelve Playwright specs
 * depend on which: the column keeps `docked-paint-first`/`docked-checkout`,
 * the drawer keeps one `cart-checkout` on both faces.
 */
export function basketCta(
  host: BasketHost,
  unpainted: number
): { face: "paint" | "checkout"; testId: string } {
  const face = unpainted > 0 ? "paint" : "checkout";
  return {
    face,
    testId:
      host === "drawer"
        ? "cart-checkout"
        : face === "paint"
          ? "docked-paint-first"
          : "docked-checkout",
  };
}

/**
 * Task 4 — what an unpainted row's chip does in this host (the `paintTarget`
 * task 2 built). With a configuration on screen the chip is the palette
 * picker and Paint works, exactly as step 3 has always behaved. With none —
 * the drawer opened at step 1 — there is nothing to paint WITH, so the chip
 * becomes a link to step 2, on the design we know about if we know one.
 *
 * Final-review finding 5: `lineDesignSlug` does NOT come from the line.
 * `unpaintLines()` sets `configSnapshot: null` (cart.ts), so an unpainted
 * row's own slug is always undefined and this always answered the bare
 * `/configurator` — step 1 with the catalog's first design, when card §1
 * asks the chip to «porta lì». The caller falls back to the `design` of the
 * URL the drawer is open over (`Basket`'s `fallbackDesignSlug`); the bare
 * configurator is now only for a drawer opened somewhere with no design at
 * all, e.g. over `/order`.
 */
export function paintTargetFor(
  currentConfig: { designSlug: string } | null,
  lineDesignSlug?: string | null
): { kind: "palette" } | { kind: "none"; href: string } {
  if (currentConfig) return { kind: "palette" };
  const slug = lineDesignSlug ?? null;
  return {
    kind: "none",
    href: slug
      ? `/configurator?design=${encodeURIComponent(slug)}&step=2`
      : "/configurator",
  };
}

/**
 * R5-TEXT-CARRY task 2 (AC3) — what an EXPLICITLY picked row paints with.
 *
 * A paint through a saved palette carries that palette's snapshot WHOLE —
 * colours AND dedication (`snapshot.customText`/`customNote`), untouched.
 * The words on screen are ignored BY CONSTRUCTION: this function takes only
 * the palette, so there is no parameter the on-screen words could even
 * arrive through. That reverses the old TL ruling the explicit branch of
 * `rowThumb` (`basket.tsx`) encoded — "takes the palette's colours but keeps
 * the customer's own words": since R5-TEXT-IDENTITY the inscription is part
 * of the palette's identity (dedup by exact code in `savePalette`), so
 * painting "Trude" while "Mons" is on screen must paint "Trude".
 *
 * `hexes`/`selectionCount` derive from `snapshot.selections` exactly as the
 * old inline branch did (`hexes` skips hex-less selections; `selectionCount`
 * counts them — one entry per category).
 * `label` is the palette's own name. The snapshot is passed by reference —
 * `paintLines` (`cart.ts`) stores it on the new line without mutating it.
 */
export function explicitPickThumb(palette: Palette): {
  code: string;
  layers: CartLayer[];
  label: string;
  dedication: string | undefined;
  textPosition: TextPosition | undefined;
  hexes: string[];
  snapshot: ConfigSnapshot;
  selectionCount: number;
} {
  return {
    code: palette.code,
    layers: palette.layers,
    label: palette.name,
    dedication: palette.snapshot.customText,
    textPosition: palette.snapshot.textPosition,
    hexes: palette.snapshot.selections
      .map((s) => s.hex)
      .filter((h): h is string => Boolean(h)),
    snapshot: palette.snapshot,
    selectionCount: palette.snapshot.selections.length,
  };
}

/**
 * Final-review finding 4a — «Paint N pieces first ›» from the DRAWER.
 *
 * R5-TEXT-IDENTITY task 4 revision: `line-payload.ts` now folds the
 * inscription into the config code itself (`encodeConfigCode`'s `extras`) —
 * «la push si porta la dedica perché si porta il codice», the card's own
 * point. So this href no longer WRITES `?text=` at all: the code carries it,
 * and a stale `text=` left over from wherever this URL came from is always
 * dropped, never kept — `configurator/page.tsx` treats an explicit `?text=`
 * as the live edit and lets it OVERRIDE what the code says, so a leftover
 * value here would silently win over the configuration on screen.
 *
 * `?note=` is a different story and still rides the URL: the colour WISH
 * enters the code only as a 4-char hash (`hashNote`, never reversible), so
 * the actual WORDS still need to travel some other way to reach the
 * rebuilt snapshot — the order mail and the lab PDF read the snapshot, not
 * the hash.
 *
 * Built from the URL the drawer is already on, with `customNote` taken from
 * the CONFIGURATION ON SCREEN rather than from the query: at step 2 it lives
 * in component state and only reaches the URL on `goToStep`, so someone who
 * types a wish and taps this CTA straight away has nothing in
 * `searchParams` yet. `currentConfig.snapshot` has it (both steps publish it
 * through `withCustomFields`), and the same gate `goToStep` applies decides
 * whether it's written or dropped — so this href and the one step 2's own
 * «Continue» produces are the same URL.
 *
 * Everything else on the query is kept (`origin`, …); what the code
 * supersedes is dropped so nothing is ambiguous about which wins — `design`
 * and every `opt_*` (the client's own decode effect puts both back from the
 * code).
 *
 * No configuration on screen (the drawer opened at step 1) → the bare
 * configurator, unchanged.
 */
/**
 * Bug fix (24/9, post-R5-GARANZIA) — Paint and the inline picker must refuse
 * a palette whose DESIGN doesn't actually cover the ceramic it would paint
 * (repro: a Striper DAN palette painting a Taco set — Striper never shipped
 * on that product). `designProducts` is `cart-context.tsx`'s own
 * design→covered-product-ids map (`designProductIds`, server action); `null`
 * means "not loaded yet" for the WHOLE map, missing key means "not loaded
 * yet for this design" — either way the answer is `false`: a Paint button
 * that's briefly off beats one that silently paints the wrong ceramic.
 */
export function canPaintWith(
  designProducts: Record<string, string[]> | null,
  designSlug: string | null | undefined,
  productId: string
): boolean {
  if (!designProducts || !designSlug) return false;
  return designProducts[designSlug]?.includes(productId) ?? false;
}

export function paintFirstHref(
  params: URLSearchParams | null,
  config: {
    code: string;
    snapshot: { customNote?: string };
  } | null
): string {
  if (!config) return "/configurator";
  const next = new URLSearchParams(params ?? undefined);
  next.set("code", config.code);
  next.set("step", "3");
  next.delete("design");
  for (const key of [...next.keys()]) if (key.startsWith("opt_")) next.delete(key);
  const note = (config.snapshot.customNote ?? "").trim();
  if (note) next.set("note", note);
  else next.delete("note");
  // The code is the inscription's memory now (task 2) — never write it here,
  // and never trust a stale one left over from an earlier URL either.
  next.delete("text");
  return `/configurator?${next.toString()}`;
}
