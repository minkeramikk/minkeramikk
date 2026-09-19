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
