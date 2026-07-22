"use client";

import { useCallback, useEffect, useState } from "react";
import type { Cart } from "./cart";
import { STORAGE_KEY as CART_STORAGE_KEY, loadCart } from "./use-cart";
import { clampQty } from "./set-code";
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
  replaceCart: (lines: Cart) => boolean,
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

  /**
   * Scrive SUBITO: lo slot è l'unica copia di quelle righe, niente effetti
   * differiti. La scrittura durevole va PRIMA di setSlot: se setItem lancia
   * (quota piena, Safari privato), il gesto deve fermarsi qui — se
   * aggiornassimo lo stato prima, il chiamante crederebbe lo slot salvato e
   * proseguirebbe (es. clearCart()), perdendo entrambe le copie. Ritorna
   * false in quel caso così il chiamante può abortire e mostrare `failed`.
   */
  const persist = useCallback((next: SavedCart | null): boolean => {
    try {
      if (next) window.localStorage.setItem(SAVED_CART_KEY, serializeSavedCart(next));
      else window.localStorage.removeItem(SAVED_CART_KEY);
    } catch {
      return false;
    }
    setSlot(next);
    setUnsupported(false);
    return true;
  }, []);

  const performSwap = useCallback(async () => {
    setFailed(false);
    setReport(null);

    // salvataggio puro: niente da validare, niente rete
    if (!slot) {
      if (!persist(snapshotCart(cart, new Date()))) {
        setFailed(true);
        return;
      }
      clearCart();
      return;
    }

    setPending(true);
    try {
      // Punto di verità PRIMA dell'unico await di questa funzione: si rilegge
      // la chiave di nuovo DOPO la fetch e si confronta, per scoprire se
      // un'altra tab ha scritto lo slot nel frattempo (nessun mutex tra tab).
      const slotRawAtStart = window.localStorage.getItem(SAVED_CART_KEY);
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
              // Il server ignora comunque questo campo (la quantità
              // ripristinata viene dallo slot), ma lo schema zod la cappa a
              // 99: uno slot con quantità più alta (nessun tetto negli
              // stepper) farebbe fallire OGNI tentativo di ripristino con
              // 400, bloccando lo slot per sempre.
              quantity: clampQty(l.quantity),
            })),
          }),
        });
        if (!res.ok) throw new Error(String(res.status));
        ({ results } = (await res.json()) as { results: ValidatedEntry[] });
      }
      // Da qui in poi lo STORAGE è la fonte di verità, non `cart`/`slot`
      // catturati alla chiusura del click: durante l'await un'altra tab può
      // aver scritto il carrello o lo slot. Si rilegge il carrello (per usarlo)
      // e lo slot (solo per confrontarlo) — mai i valori chiusi sull'evento.
      const currentCart = loadCart();
      const slotRawNow = window.localStorage.getItem(SAVED_CART_KEY);
      if (slotRawNow !== slotRawAtStart) {
        // Lo slot che abbiamo appena validato non è più quello in storage:
        // scambiare comunque vorrebbe dire sovrascrivere la scrittura
        // dell'altra tab con dati vecchi. Onestà > completamento silenzioso —
        // si aborta con lo stesso avviso di validazione fallita, l'utente
        // riprova sullo stato reale.
        setFailed(true);
        return;
      }
      // ri-allineare gli esiti alle righe salvate: le non-validabili sono "removed"
      let k = 0;
      const aligned: ValidatedEntry[] = slot.lines.map((l) =>
        l.productSlug ? results[k++] : { ok: false, reason: "product" }
      );
      const { cart: restored, report: restoreReport } = buildRestoredCart(slot, aligned);
      const next = swapCarts(currentCart, restored, new Date());

      // Lo scambio tocca DUE chiavi (lo slot e mk-cart-v1). Le due scritture
      // durevoli stanno qui, una dopo l'altra, nello STESSO blocco sincrono:
      // niente await nel mezzo, quindi una tab che si chiude non può
      // infilarsi tra le due — l'unico fallimento realistico è un setItem
      // che lancia (quota piena, Safari privato). Perciò: prima le due
      // scritture grezze (non tramite persist()/replaceCart(), che
      // impegnerebbero lo stato subito), POI lo stato React.
      // - Se la PRIMA (lo slot) lancia: non abbiamo toccato nulla, si aborta.
      // - Se la SECONDA (il carrello) lancia: lo slot è già atterrato e va
      //   RIPRISTINATO al valore letto prima di sovrascriverlo — altrimenti
      //   le righe che dovevano finire nel carrello sparirebbero da
      //   entrambe le parti (né nello slot né in mk-cart-v1).
      // Solo a scritture confermate si passa allo stato, tramite
      // persist()/replaceCart(): riscrivono lo stesso valore già verificato
      // (ridondante ma innocuo — stesso storage, un istante dopo) e
      // aggiornano lo stato al successo, così resta UNA sola definizione di
      // "come si scrive" ciascuna chiave.
      const prevSlotRaw = window.localStorage.getItem(SAVED_CART_KEY);
      try {
        if (next.slot) {
          window.localStorage.setItem(SAVED_CART_KEY, serializeSavedCart(next.slot));
        } else {
          window.localStorage.removeItem(SAVED_CART_KEY);
        }
      } catch {
        setFailed(true);
        return;
      }
      try {
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next.cart));
      } catch {
        // rollback: lo slot era già scritto, il carrello no.
        try {
          if (prevSlotRaw === null) window.localStorage.removeItem(SAVED_CART_KEY);
          else window.localStorage.setItem(SAVED_CART_KEY, prevSlotRaw);
        } catch {
          // best-effort: stesso identico setItem riuscito un istante prima,
          // un secondo fallimento qui non è atteso — niente altro da fare.
        }
        setFailed(true);
        return;
      }

      // Il disco è già a posto: un fallimento qui non perde niente, ma
      // lascerebbe lo STATO indietro rispetto allo storage senza dirlo a
      // nessuno. Entrambe le chiamate vanno eseguite (niente short-circuit)
      // e l'anomalia si segnala con lo stesso avviso della validazione.
      const slotCommitted = persist(next.slot);
      const cartCommitted = replaceCart(next.cart);
      if (!slotCommitted || !cartCommitted) setFailed(true);
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
      if (pending) return;
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
