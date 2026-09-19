"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useCart } from "./use-cart";
import { basketOpen } from "./basket-open";
import { usePalettes } from "@/lib/palettes/use-palettes";
import {
  computeCartDiscount,
  activeSuggestions,
  type ActiveSuggestion,
  type CartDiscount,
  type DiscountConfig,
} from "@/lib/discounts/discount";
import { buildSuggestionLine } from "@/lib/discounts/suggestion-line";
import { designProductIds } from "@/lib/catalog/design-products-action";
import type { BasketHost } from "@/components/ui-domain/basket-host";
import {
  clampPaintN,
  pruneToLive,
  unpaintedPieces,
  type CartLayer,
  type ConfigSnapshot,
} from "./cart";

/**
 * R5-BASKET-HOST task 1 — what the drawer/step-3 `Basket` needs to know is
 * "painting right now": not just the code (the old `currentConfigCode`), but
 * enough of the config to render a preview chip from OUTSIDE the configurator
 * subtree (the header drawer has no access to step 2/3's own state).
 */
export type CurrentConfig = {
  code: string;
  snapshot: ConfigSnapshot;
  layers: CartLayer[];
  designSlug: string;
  /**
   * Task 4 — the NAME of what is painting ("painted with <b>Antimonio</b>",
   * and the fallback label on an untouched row's chip). Published, never
   * recomputed by the consumer: `nameFor()` needs `MK_PALETTE_WORDS`, a
   * server read the `Basket` cannot do, and step 2 and step 3 already
   * compute this exact string for their own palette bar. One source, so the
   * bar and the basket can never name the same configuration two ways.
   */
  label: string;
  /**
   * Task 4 — did the customer actually CHOOSE this configuration, or is it
   * the page's positional fallback (a bare `?set=` landing)? AC4: the
   * basket's «painted with» line stays away for a fallback, exactly as
   * `hasConfig` gated it in `ceramics-step.tsx`. The rest of the basket does
   * not care: there IS a configuration on screen either way, so rows stay
   * paintable — which is why this is a flag and not a null `CurrentConfig`.
   */
  explicit: boolean;
};

/**
 * Shared cart view (F16). The cart STATE and persistence already live in
 * `use-cart` (F03: localStorage + cross-tab sync). This provider just calls
 * that hook ONCE and shares the single instance, so the header badge, the
 * drawer, and step 3 all read/mutate the same source within a tab — no new
 * cart logic. It also holds the drawer open/closed flag (pure UI state).
 *
 * R4-SCONTI: also computes the discount ONCE here from the server-read config,
 * so every cart surface (badge, drawer, step 3) reads the same CartDiscount
 * object instead of each recomputing it.
 */
/**
 * R5-BASKET-HOST QA — the guard that makes the trash bug a compile error.
 *
 * The value below is `{ ...cart, ...palettes, … }`, so any key the two hooks
 * SHARE is silently won by the later spread. That is not hypothetical: both
 * exposed `remove(id: string): void`, with identical signatures, so this
 * intersection type accepted it and `remove` resolved to `deletePalette` —
 * every basket's trash button called it with a cart line id and removed
 * nothing at all. `hydrated`/`palettesHydrated` was the same collision, one
 * card earlier. An intersection type cannot catch this (two identical
 * signatures intersect to themselves), so the overlap is asserted directly:
 * add a shared key to either hook and this line stops compiling.
 */
type SharedKeys = Extract<
  keyof ReturnType<typeof useCart>,
  keyof ReturnType<typeof usePalettes>
>;
const _noHookKeyCollision: SharedKeys extends never ? true : never = true;
void _noHookKeyCollision;

type CartApi = ReturnType<typeof useCart> &
  ReturnType<typeof usePalettes> & {
    open: boolean;
    /**
     * The ONE door to the basket's open state — the header's `SheetTrigger`
     * reaches it through `onOpenChange`, step 3's sticky bar through
     * `openCart()`. It is guarded (`basketOpen`), so neither call site
     * carries the rule: a request to open while `keyboardOpen` is dropped,
     * not queued.
     */
    setOpen: (open: boolean) => void;
    openCart: () => void;
    closeCart: () => void;
    /**
     * R5-BASKET-HOST task 8, card §3: an on-screen keyboard is up — today
     * that means step 2's Text field has focus ON A DEVICE THAT HAS one (the
     * publisher asks `hoverCapable()`; PR 2 review finding 6). Published here
     * rather than kept inside step 2 because the basket it has to keep shut
     * lives in the persistent header, not in the step
     * (`configurator-client.tsx` sets it on focus/blur, clears it on the way
     * out of step 2, and clears it when it unmounts).
     *
     * Named for what it carries, not for the gesture behind it: on a desktop
     * the customer types with no keyboard in the way, and this stays `false`.
     */
    keyboardOpen: boolean;
    setKeyboardOpen: (open: boolean) => void;
    /** R4-SCONTI: the discount config as read on the server this render. */
    discountConfig: DiscountConfig;
    /** R4-SCONTI: computed ONCE here — every surface reads the same object. */
    discount: CartDiscount;
    /**
     * Part ②: the offers the cart can show right now, in the admin's order and
     * capped (MAX_SUGGESTIONS). Empty once the visitor closes the block.
     */
    suggestions: ActiveSuggestion[];
    /** The ✕ closes the WHOLE block, not one offer — closing a card to reveal the
     *  next is the behaviour the list replaced. Session-only, never persisted. */
    dismissSuggestions: () => void;
    /** Step 2/3 tell the cart which configuration is on screen, so an offer
     *  can borrow the design the customer is actually looking at, and (R5-
     *  BASKET-HOST) the header drawer can render its own preview chip. Null
     *  elsewhere — that absence is what makes the chip dead at step 1. */
    currentConfig: CurrentConfig | null;
    setCurrentConfig: (config: CurrentConfig | null) => void;
    /**
     * R5-BASKET-HOST fix round 1 — state that belongs to THE basket, not to
     * whichever container is drawing it. The card's own thesis: «non esistono
     * due carrelli», so the step-3 column, its mobile twin and the header
     * drawer must all read and write these, never a copy each.
     *
     * Checkout is a MODE of the basket: the order form replaces the rows.
     * Held per container it was last-write-wins with no arbitration - on an
     * iPad crossing `md` between landscape and portrait the copy that
     * published `true` is not the copy that renders, and the customer got
     * neither the form nor the sticky CTA. Closed here, for every surface at
     * once, whenever the basket can no longer be ordered (see the effect in
     * the provider).
     *
     * It is ONE decision, but it carries WHERE it was taken. A boolean made
     * every mounted basket render an `<OrderForm>` - and a `<Turnstile>` -
     * off a single click: step 3 mounts TWO column copies (mobile section +
     * desktop rail) and the drawer a third, so `getByTestId("order-form")`
     * matched three nodes. `checkoutHost` names the host that asked, so only
     * that host's copies draw the form: the drawer's checkout stays in the
     * drawer, the column's in the column (both copies of it, one visible) -
     * exactly the pre-R5 behaviour. `null` is the only closed state.
     */
    checkoutHost: BasketHost | null;
    setCheckoutHost: (host: BasketHost | null) => void;
    /**
     * A pending decision ABOUT a cart line, keyed by the line's own id — not
     * view state. Which palette an unpainted row will Paint with
     * (`rowPaletteCode`, R5-PALETTES task 10) and how many of its pieces
     * (`paintN`). Held per container, a customer who picked «Zaffera» on a
     * row in the drawer and then pressed Paint on that same row in the column
     * was silently painted with the on-screen config instead.
     *
     * Read `paintN` through `paintNFor`, which clamps to the line's current
     * quantity (`clampPaintN`); both maps are pruned against live line ids by
     * the provider's own effect, because a line id recurs.
     */
    rowPaletteCode: Record<string, string>;
    setRowPalette: (lineId: string, code: string) => void;
    paintN: Record<string, number>;
    setPaintN: (lineId: string, n: number) => void;
    paintNFor: (line: { id: string; quantity: number }) => number;
    /** Part ②: add the suggested ceramic wearing the trigger line's design. */
    acceptSuggestion: (suggestion: ActiveSuggestion) => void;
    /**
     * R4-FIX Ⓔ — D3 for every surface: may the line `fromLineId` lend its design
     * to `productId`? False while the whitelists are still loading, and false for
     * a line this cart does not hold (step 3 answers for its own projected line).
     */
    allowedProduct: (fromLineId: string, productId: string) => boolean;
  };

const CartContext = createContext<CartApi | null>(null);

export function CartProvider({
  children,
  config,
}: {
  children: ReactNode;
  config: DiscountConfig;
}) {
  const cart = useCart();
  const palettes = usePalettes();
  const [open, setOpenState] = useState(false);
  /** See `keyboardOpen` on `CartApi`: owned here because the drawer it guards
   *  is mounted in the header, above whatever step is on screen. */
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  /** Every request to open or close the basket goes through `basketOpen`,
   *  which is where the keyboard rule lives (and is unit-tested).
   *  Consequence worth naming: this identity changes when the flag flips, so
   *  a consumer holding `setOpen` in a dep array re-runs then. There is one
   *  (`cart-menu.tsx` closes the drawer on route change) and its extra run is
   *  a `setOpen(false)` on an already-closed drawer — React bails out. */
  const setOpen = useCallback(
    (request: boolean) =>
      setOpenState((current) =>
        basketOpen({ current, request, typing: keyboardOpen })
      ),
    [keyboardOpen]
  );
  /** The other half of the same rule: the keyboard coming up closes a basket
   *  that is already open. Passing no `request` means «re-decide what is true
   *  now», so the way back down (no keyboard) is an identity — nothing
   *  reopens on blur, because the dropped request was never remembered. */
  useEffect(() => {
    setOpenState((current) => basketOpen({ current, typing: keyboardOpen }));
  }, [keyboardOpen]);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<CurrentConfig | null>(null);
  const [checkoutHost, setCheckoutHost] = useState<BasketHost | null>(null);
  const [rowPaletteCode, setRowPaletteCode] = useState<Record<string, string>>({});
  const [paintN, setPaintNMap] = useState<Record<string, number>>({});
  const lines = cart.cart;

  const setRowPalette = useCallback(
    (lineId: string, code: string) =>
      setRowPaletteCode((m) => ({ ...m, [lineId]: code })),
    []
  );
  const setPaintN = useCallback(
    (lineId: string, n: number) => setPaintNMap((m) => ({ ...m, [lineId]: n })),
    []
  );
  const paintNFor = useCallback(
    (line: { id: string; quantity: number }) => clampPaintN(paintN[line.id], line.quantity),
    [paintN]
  );

  /**
   * The two line-keyed maps are pruned HERE, where they live — one effect,
   * one `liveIds` set, `pruneToLive` shared with `Basket`'s own effect over
   * the view-only pointers it still owns. Never two effects over one map.
   */
  useEffect(() => {
    const liveIds = new Set(lines.map((l) => l.id));
    setRowPaletteCode((m) => pruneToLive(m, liveIds));
    setPaintNMap((m) => pruneToLive(m, liveIds));
  }, [lines]);

  /**
   * The order can never leave with colourless pieces (task 13), and there is
   * nothing to order out of an empty basket — so the checkout mode closes
   * itself in both cases, for every surface at once. Gating only the RENDER
   * was the old bug: the flag stayed `true`, the sticky bar hid itself with
   * nothing to show for it, and the form popped back open unprompted the
   * moment the last piece was painted. Owning the flag here is what finally
   * makes one rule enough.
   */
  useEffect(() => {
    if (unpaintedPieces(lines) > 0 || lines.length === 0) setCheckoutHost(null);
  }, [lines]);

  const dismissSuggestions = useCallback(() => setSuggestionsDismissed(true), []);

  const discount = useMemo(
    () =>
      computeCartDiscount(
        cart.cart.map((l) => ({
          id: l.id,
          productId: l.productId,
          unitPriceCents: l.unitPriceCents,
          currency: l.currency,
          quantity: l.quantity,
          dealRuleId: l.dealRuleId,
        })),
        config
      ),
    [cart.cart, config]
  );

  // Part ②: a rule requires the suggested ceramic and the trigger line to
  // share a supplier (the config code means nothing on another supplier's
  // product), so both lookups are keyed off the cart itself / the rule's own
  // resolved `suggested` card — no extra fetch.
  const supplierOf = useCallback(
    (lineId: string) => cart.cart.find((l) => l.id === lineId)?.supplierId ?? null,
    [cart.cart]
  );
  const supplierOfProduct = useCallback(
    (productId: string) =>
      config.rules.find((r) => r.suggested?.id === productId)?.suggested?.supplierId ?? null,
    [config.rules]
  );

  /**
   * R4-FIX Ⓔ — the whitelist of every design in the cart. Keyed by slug and
   * refetched only when the SET of designs changes, so adding a second plate of
   * a design already in the basket costs nothing.
   *
   * `null` means "we do not know yet", and the lookup below answers `false` to
   * everything until it does: an offer the workshop cannot make must never
   * flash on screen while the answer is in flight.
   */
  const designSlugs = useMemo(
    () =>
      [...new Set(cart.cart.map((l) => l.configSnapshot?.designSlug).filter(Boolean))]
        .sort()
        .join(","),
    [cart.cart]
  );
  const [designProducts, setDesignProducts] = useState<Record<string, string[]> | null>(
    null
  );
  useEffect(() => {
    if (!designSlugs) {
      setDesignProducts({});
      return;
    }
    let alive = true;
    setDesignProducts(null);
    designProductIds(designSlugs.split(","))
      .then((m) => alive && setDesignProducts(m))
      .catch(() => alive && setDesignProducts(null));
    return () => {
      alive = false;
    };
  }, [designSlugs]);

  const allowedProduct = useCallback(
    (fromLineId: string, productId: string) => {
      const slug = cart.cart.find((l) => l.id === fromLineId)?.configSnapshot?.designSlug;
      return slug ? (designProducts?.[slug]?.includes(productId) ?? false) : false;
    },
    [cart.cart, designProducts]
  );

  const suggestions = useMemo(
    () =>
      suggestionsDismissed
        ? []
        : activeSuggestions(
            cart.cart.map((l) => ({
              id: l.id,
              productId: l.productId,
              unitPriceCents: l.unitPriceCents,
              currency: l.currency,
              quantity: l.quantity,
              dealRuleId: l.dealRuleId,
              // R5-UNPAINTED: DiscountLineInput.configCode is string|undefined,
              // never null — an unpainted line still counts for its quantity
              // tier, it just has no design to match a suggestion donor on.
              configCode: l.configCode ?? undefined,
            })),
            config,
            {
              supplierOf,
              supplierOfProduct,
              allowedProduct,
              currentConfigCode: currentConfig?.code ?? null,
            }
          ),
    [
      cart.cart,
      config,
      suggestionsDismissed,
      currentConfig,
      supplierOf,
      supplierOfProduct,
      allowedProduct,
    ]
  );

  /**
   * Add the suggested ceramic wearing the design of the line that triggered the
   * rule (ADR 0023 (e)) — inheritance contract lives in `buildSuggestionLine`
   * (unit-tested), so this hook is just wiring. It takes the offer explicitly:
   * with a list on screen the caller knows which one was clicked, and having it
   * re-derive "the current one" is how a click lands on the wrong row.
   */
  const acceptSuggestion = useCallback(
    (suggestion: ActiveSuggestion) => {
      // The donor named by the engine can be the sheet's HYPOTHETICAL line —
      // not a cart line at all (R4-SCONTI-2 §D.2: an offer taken when the basket
      // alone already fires the rule adds only the suggested ceramic). In that
      // case the trigger group is by definition already in the cart, so fall
      // back to the first real line of it. Fixed here rather than at the call
      // site: every caller routes through this one lookup.
      const from =
        cart.cart.find((l) => l.id === suggestion.fromLineId) ??
        cart.cart.find(
          (l) =>
            l.productId &&
            suggestion.rule.triggerProductIds.includes(l.productId) &&
            // R5-UNPAINTED: an offer inherits the donor's design — a line with
            // no design cannot donate. Without this the engine's own donor
            // pick (which already skips unpainted lines) would be silently
            // undone by this fallback landing on one anyway.
            l.configCode !== null
        );
      if (!from) return;
      const line = buildSuggestionLine(suggestion, from);
      if (!line) return;
      cart.add(line);
      // No dismissal here: D1 drops the accepted offer from the list on the next
      // render because its product is now in the cart, and the others stay.
    },
    [cart]
  );

  const value = useMemo<CartApi>(
    () => ({
      ...cart,
      ...palettes,
      open,
      setOpen,
      openCart: () => setOpen(true),
      closeCart: () => setOpen(false),
      keyboardOpen,
      setKeyboardOpen,
      discountConfig: config,
      discount,
      suggestions,
      dismissSuggestions,
      currentConfig,
      setCurrentConfig,
      checkoutHost,
      setCheckoutHost,
      rowPaletteCode,
      setRowPalette,
      paintN,
      setPaintN,
      paintNFor,
      acceptSuggestion,
      allowedProduct,
    }),
    [
      cart,
      palettes,
      open,
      setOpen,
      keyboardOpen,
      config,
      discount,
      suggestions,
      dismissSuggestions,
      currentConfig,
      checkoutHost,
      rowPaletteCode,
      setRowPalette,
      paintN,
      setPaintN,
      paintNFor,
      acceptSuggestion,
      allowedProduct,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCartContext(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCartContext must be used within a CartProvider");
  }
  return ctx;
}
