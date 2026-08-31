"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useCart } from "./use-cart";
import {
  computeCartDiscount,
  activeSuggestions,
  type ActiveSuggestion,
  type CartDiscount,
  type DiscountConfig,
} from "@/lib/discounts/discount";
import { buildSuggestionLine } from "@/lib/discounts/suggestion-line";

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
type CartApi = ReturnType<typeof useCart> & {
  open: boolean;
  setOpen: (open: boolean) => void;
  openCart: () => void;
  closeCart: () => void;
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
  /** Step 3 tells the cart which configuration is on screen, so an offer can
   *  borrow the design the customer is actually looking at. Null elsewhere. */
  setCurrentConfigCode: (code: string | null) => void;
  /** Part ②: add the suggested ceramic wearing the trigger line's design. */
  acceptSuggestion: (suggestion: ActiveSuggestion) => void;
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
  const [open, setOpen] = useState(false);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [currentConfigCode, setCurrentConfigCode] = useState<string | null>(null);

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
              configCode: l.configCode,
            })),
            config,
            { supplierOf, supplierOfProduct, currentConfigCode }
          ),
    [
      cart.cart,
      config,
      suggestionsDismissed,
      currentConfigCode,
      supplierOf,
      supplierOfProduct,
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
      const from = cart.cart.find((l) => l.id === suggestion.fromLineId);
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
      open,
      setOpen,
      openCart: () => setOpen(true),
      closeCart: () => setOpen(false),
      discountConfig: config,
      discount,
      suggestions,
      dismissSuggestions,
      setCurrentConfigCode,
      acceptSuggestion,
    }),
    [
      cart,
      open,
      config,
      discount,
      suggestions,
      dismissSuggestions,
      acceptSuggestion,
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
