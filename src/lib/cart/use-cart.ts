"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addToCart,
  removeLine,
  updateQuantity,
  type Cart,
  type NewCartLine,
} from "./cart";

const STORAGE_KEY = "mk-cart-v1";

function load(): Cart {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Cart) : [];
  } catch {
    return [];
  }
}

/**
 * Cart state persisted to localStorage (F03 AC3). Hydrates after mount to
 * avoid SSR/client mismatch; every change is written back synchronously.
 * Also listens to `storage` events so other tabs stay in sync.
 */
export function useCart() {
  const [cart, setCart] = useState<Cart>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCart(load());
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setCart(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart, hydrated]);

  const add = useCallback((line: NewCartLine) => {
    setCart((c) => addToCart(c, line));
  }, []);
  const setQuantity = useCallback((id: string, qty: number) => {
    setCart((c) => updateQuantity(c, id, qty));
  }, []);
  const remove = useCallback((id: string) => {
    setCart((c) => removeLine(c, id));
  }, []);
  const clear = useCallback(() => {
    setCart([]);
    // Persist the empty cart SYNCHRONOUSLY: the persistence effect runs after
    // render, but order submit calls clear() then immediately router.push()s —
    // navigation can unmount before the effect flushes, leaving localStorage
    // full → the cart "never empties". Writing here makes it empty before nav.
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    }
  }, []);

  /**
   * F40 — replaces the WHOLE cart (restoring a saved cart). Same reasoning as
   * clear(): the caller writes the saved-cart slot synchronously and THEN
   * calls this — if the tab closes between that slot write and this hook's
   * deferred persistence effect, the restored lines would live in neither
   * localStorage key. Write mk-cart-v1 synchronously too, so there's never a
   * gap where both keys can be stale at once.
   */
  const replace = useCallback((lines: Cart) => {
    setCart(lines);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    }
  }, []);

  return { cart, hydrated, add, setQuantity, remove, clear, replace };
}
