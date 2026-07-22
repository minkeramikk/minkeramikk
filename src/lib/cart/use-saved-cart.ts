"use client";

import { useCallback, useEffect, useState } from "react";
import type { Cart } from "./cart";
import {
  SAVED_CART_KEY,
  buildRestoredCart,
  needsSwapConfirm,
  parseSavedCart,
  serializeSavedCart,
  snapshotCart,
  swapCarts,
  type RestoreReport,
  type SavedCart,
  type ValidatedEntry,
} from "./saved-cart";

/**
 * F40 — lo slot unico del carrello salvato, persistito in localStorage.
 * Gemello di use-cart.ts (stessa idratazione post-mount, stessa sync `storage`
 * cross-tab): due tab aperte non devono potersi mangiare lo slot a vicenda.
 *
 * Salvare e riprendere sono LO STESSO gesto (decisione di prodotto 2): entrambi
 * passano da `performSwap`, entrambi chiedono conferma con lo stesso dialogo
 * quando ci sono cose da entrambe le parti.
 */
export function useSavedCart(
  cart: Cart,
  replaceCart: (lines: Cart) => void,
  clearCart: () => void
) {
  const [slot, setSlot] = useState<SavedCart | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState<"save" | "restore" | null>(null);
  const [report, setReport] = useState<RestoreReport | null>(null);
  const [failed, setFailed] = useState(false);

  const read = useCallback(() => {
    const parsed = parseSavedCart(window.localStorage.getItem(SAVED_CART_KEY));
    setUnsupported(parsed.kind === "unsupported");
    setSlot(parsed.kind === "ok" ? parsed.saved : null);
  }, []);

  useEffect(() => {
    read();
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === SAVED_CART_KEY) read();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [read]);

  /** Scrive SUBITO: lo slot è l'unica copia di quelle righe, niente effetti differiti. */
  const persist = useCallback((next: SavedCart | null) => {
    setSlot(next);
    setUnsupported(false);
    if (next) window.localStorage.setItem(SAVED_CART_KEY, serializeSavedCart(next));
    else window.localStorage.removeItem(SAVED_CART_KEY);
  }, []);

  const performSwap = useCallback(async () => {
    setFailed(false);
    setReport(null);

    // salvataggio puro: niente da validare, niente rete
    if (!slot) {
      persist(snapshotCart(cart, new Date()));
      clearCart();
      return;
    }

    setPending(true);
    try {
      // Righe legacy pre-CA-3 senza productSlug non sono validabili: si contano
      // come rimosse invece di mandare `undefined` allo schema zod (che lo
      // rifiuterebbe con 400, facendo fallire TUTTO il ripristino).
      const validatable = slot.lines.filter((l) => l.productSlug);
      let results: ValidatedEntry[] = [];
      if (validatable.length > 0) {
        const res = await fetch("/api/cart/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries: validatable.map((l) => ({
              configCode: l.configCode,
              productSlug: l.productSlug!,
              quantity: l.quantity,
            })),
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        ({ results } = (await res.json()) as { results: ValidatedEntry[] });
      }
      // ri-allineare gli esiti alle righe salvate: le non-validabili sono "removed"
      let k = 0;
      const aligned: ValidatedEntry[] = slot.lines.map((l) =>
        l.productSlug ? results[k++] : { ok: false, reason: "product" }
      );
      const { cart: restored, report: restoreReport } = buildRestoredCart(slot, aligned);
      const next = swapCarts(cart, restored, new Date());
      persist(next.slot);
      replaceCart(next.cart);
      if (restoreReport.removed.length || restoreReport.adapted.length) {
        setReport(restoreReport);
      }
    } catch {
      // mai perdita: se non possiamo validare, non tocchiamo NIENTE
      setFailed(true);
    } finally {
      setPending(false);
    }
  }, [cart, clearCart, persist, replaceCart, slot]);

  const request = useCallback(
    (kind: "save" | "restore") => {
      if (pending) return;
      if (needsSwapConfirm(cart, slot)) setConfirming(kind);
      else void performSwap();
    },
    [cart, pending, performSwap, slot]
  );

  return {
    slot,
    unsupported,
    hydrated,
    pending,
    confirming,
    report,
    failed,
    requestSave: () => request("save"),
    requestRestore: () => request("restore"),
    confirmSwap: () => {
      setConfirming(null);
      void performSwap();
    },
    cancelSwap: () => setConfirming(null),
    dismissNotice: () => {
      setReport(null);
      setFailed(false);
      setUnsupported(false);
    },
  };
}
