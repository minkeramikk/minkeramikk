"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useCart } from "./use-cart";
import {
  computeCartDiscount,
  firstSuggestion,
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
  /** Part ②: rules the visitor closed in this session (never persisted). */
  dismissedRuleIds: string[];
  dismissRule: (ruleId: string) => void;
  /** Part ②: the ONE upsell suggestion to show, or null (Task 11). */
  suggestion: ActiveSuggestion | null;
  /** Part ②: add the suggested ceramic wearing the trigger line's design. */
  acceptSuggestion: () => void;
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
  const [dismissedRuleIds, setDismissed] = useState<string[]>([]);

  const dismissRule = useCallback((ruleId: string) => {
    setDismissed((d) => (d.includes(ruleId) ? d : [...d, ruleId]));
  }, []);

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

  const suggestion = useMemo(
    () =>
      firstSuggestion(
        cart.cart.map((l) => ({
          id: l.id,
          productId: l.productId,
          unitPriceCents: l.unitPriceCents,
          currency: l.currency,
          quantity: l.quantity,
          dealRuleId: l.dealRuleId,
        })),
        config,
        { dismissedRuleIds, supplierOf, supplierOfProduct }
      ),
    [cart.cart, config, dismissedRuleIds, supplierOf, supplierOfProduct]
  );

  /**
   * Add the suggested ceramic wearing the design of the line that triggered the
   * rule (ADR 0023 (e)) — inheritance contract lives in `buildSuggestionLine`
   * (unit-tested), so this hook is just wiring.
   */
  const acceptSuggestion = useCallback(() => {
    if (!suggestion) return;
    const from = cart.cart.find((l) => l.id === suggestion.fromLineId);
    if (!from) return;
    const line = buildSuggestionLine(suggestion, from);
    if (!line) return;
    cart.add(line);
  }, [suggestion, cart]);

  const value = useMemo<CartApi>(
    () => ({
      ...cart,
      open,
      setOpen,
      openCart: () => setOpen(true),
      closeCart: () => setOpen(false),
      discountConfig: config,
      discount,
      dismissedRuleIds,
      dismissRule,
      suggestion,
      acceptSuggestion,
    }),
    [cart, open, config, discount, dismissedRuleIds, dismissRule, suggestion, acceptSuggestion]
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
