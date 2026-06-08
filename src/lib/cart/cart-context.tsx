"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useCart } from "./use-cart";

/**
 * Shared cart view (F16). The cart STATE and persistence already live in
 * `use-cart` (F03: localStorage + cross-tab sync). This provider just calls
 * that hook ONCE and shares the single instance, so the header badge, the
 * drawer, and step 3 all read/mutate the same source within a tab — no new
 * cart logic. It also holds the drawer open/closed flag (pure UI state).
 */
type CartApi = ReturnType<typeof useCart> & {
  open: boolean;
  setOpen: (open: boolean) => void;
  openCart: () => void;
  closeCart: () => void;
};

const CartContext = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const cart = useCart();
  const [open, setOpen] = useState(false);

  const value = useMemo<CartApi>(
    () => ({
      ...cart,
      open,
      setOpen,
      openCart: () => setOpen(true),
      closeCart: () => setOpen(false),
    }),
    [cart, open]
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
