/**
 * R5-BASKET-HOST task 4 — the two decisions `<Basket>` makes that are pure
 * functions of its inputs, kept OUT of `basket.tsx` so a unit test can reach
 * them: importing the component drags `OrderForm` → next-intl's client
 * navigation in, which does not resolve outside Next's own bundler (this repo
 * has no React test infra — see AGENTS.md/vitest.config.ts).
 *
 * `basket.tsx` re-exports both, so nothing else has to know they live here.
 */
/** Where this basket is mounted. Task 5 adds the header drawer; step 3's
 *  right column (and its mobile in-flow twin) is `"column"`. */
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
 * Final-review finding 4a — «Paint N pieces first ›» from the DRAWER.
 *
 * The config code deliberately never encodes `customNote`/`customText`
 * (`line-payload.ts`): those ride the working URL as `?note=` / `?text=` and
 * the server rebuilds the snapshot from them (`configurator/page.tsx`). So a
 * target built from the code alone — `/configurator?code=<code>&step=3` —
 * arrives with the colours and WITHOUT the inscription, and the customer's
 * own words are gone from the order mail and the lab PDF.
 *
 * Built from the URL the drawer is already on, with the two free-text fields
 * taken from the CONFIGURATION ON SCREEN rather than from the query: at step
 * 2 they live in component state and only reach the URL on `goToStep`, so
 * someone who types an inscription and taps this CTA straight away has
 * nothing in `searchParams` yet. `currentConfig.snapshot` has them (both
 * steps publish it through `withCustomFields`), and the same gates
 * `goToStep` applies decide whether each one is written or dropped — so
 * this href and the one step 2's own «Continue» produces are the same URL.
 *
 * Everything else on the query is kept (`origin`, …); what the code
 * supersedes is dropped so nothing is ambiguous about which wins — `design`
 * and every `opt_*` (the client's own decode effect puts both back from the
 * code).
 *
 * No configuration on screen (the drawer opened at step 1) → the bare
 * configurator, unchanged.
 */
export function paintFirstHref(
  params: URLSearchParams | null,
  config: {
    code: string;
    snapshot: { customNote?: string; customText?: string };
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
  const text = (config.snapshot.customText ?? "").trim();
  if (text) next.set("text", text);
  else next.delete("text");
  return `/configurator?${next.toString()}`;
}
