"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useCart } from "./use-cart";
import {
  computeCartDiscount,
  type CartDiscount,
  type DiscountConfig,
} from "@/lib/discounts/discount";

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
    }),
    [cart, open, config, discount, dismissedRuleIds, dismissRule]
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
