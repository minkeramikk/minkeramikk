"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useCart } from "./use-cart";
import { useSavedCart } from "./use-saved-cart";

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
  /** F40: lo slot unico del carrello salvato, condiviso come il carrello. */
  saved: ReturnType<typeof useSavedCart>;
};

const CartContext = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const cart = useCart();
  const saved = useSavedCart(cart.cart, cart.replace, cart.clear);
  const [open, setOpen] = useState(false);

  // F40 fix: "Lagre til senere" nello stack step 3 può innescare uno scambio
  // A PIENO (slot già occupato) — valida, può togliere righe, può fallire —
  // ma il drawer è chiuso e Radix smonta il contenuto della Sheet quando è
  // chiusa: l'avviso (report/failed) non lo vedrebbe nessuno (AC5 a metà).
  // Si apre il drawer SOLO quando c'è qualcosa da dire — uno scambio pulito
  // non deve interrompere chi sta continuando a comporre il carrello.
  useEffect(() => {
    if (saved.report || saved.failed) setOpen(true);
  }, [saved.report, saved.failed]);

  const value = useMemo<CartApi>(
    () => ({
      ...cart,
      saved,
      open,
      setOpen,
      openCart: () => setOpen(true),
      closeCart: () => setOpen(false),
    }),
    [cart, saved, open]
  );

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

export function useCartContext(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCartContext must be used within a CartProvider");
  }
  return ctx;
}
