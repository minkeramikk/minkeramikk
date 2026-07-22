/**
 * F40 — "Lagre til senere": lo slot UNICO del carrello salvato. Puro,
 * serializzabile, niente React e niente localStorage (quello sta in
 * use-saved-cart.ts, come cart.ts sta a use-cart.ts).
 *
 * Lo "snapshot completo della riga" non è un formato nuovo: una CartLine
 * contiene già design, colori, ceramica, quantità, nota colore (R2-2b) e
 * scritta personalizzata (F38). Lo slot è quindi un contenitore versionato di
 * CartLine — un formato parallelo sarebbe solo un secondo posto dove
 * dimenticarsi un campo.
 */
import { itemCount, type Cart, type CartLine } from "./cart";

/** Chiave dedicata, stessa convenzione di `mk-cart-v1` (use-cart.ts). */
export const SAVED_CART_KEY = "mk-saved-cart-v1";

/**
 * Versione del payload. Ridondante con il suffisso della chiave e va bene
 * così: la chiave protegge da un formato futuro *incompatibile* (si cambia
 * chiave), il campo protegge dal caso opposto — un browser che ha già scritto
 * una versione più NUOVA (utente su due tab/deploy diversi). Versione ignota →
 * slot ignorato con messaggio, mai crash (AC6).
 */
export const SAVED_CART_VERSION = 1;

export interface SavedCart {
  version: number;
  /** ISO timestamp del salvataggio (data breve nella riga del drawer). */
  savedAt: string;
  lines: CartLine[];
}

export type ParsedSlot =
  | { kind: "empty" }
  | { kind: "unsupported"; version: number }
  | { kind: "ok"; saved: SavedCart };

/** Copia profonda via JSON: le CartLine sono già JSON-friendly per contratto. */
export function snapshotCart(cart: Cart, now: Date): SavedCart {
  return {
    version: SAVED_CART_VERSION,
    savedAt: now.toISOString(),
    lines: JSON.parse(JSON.stringify(cart)) as CartLine[],
  };
}

export function serializeSavedCart(saved: SavedCart): string {
  return JSON.stringify(saved);
}

/** Difensivo come `load()` in use-cart.ts: non lancia MAI. */
export function parseSavedCart(raw: string | null): ParsedSlot {
  if (!raw) return { kind: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "empty" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { kind: "empty" };
  }
  const slot = parsed as Partial<SavedCart>;
  if (typeof slot.version !== "number") return { kind: "empty" };
  if (slot.version !== SAVED_CART_VERSION) {
    return { kind: "unsupported", version: slot.version };
  }
  if (!Array.isArray(slot.lines) || slot.lines.length === 0) {
    return { kind: "empty" };
  }
  return {
    kind: "ok",
    saved: {
      version: slot.version,
      savedAt: typeof slot.savedAt === "string" ? slot.savedAt : "",
      lines: slot.lines as CartLine[],
    },
  };
}

/** Pezzi nello slot — stessa metrica del badge in header (somma quantità). */
export function savedPieces(saved: SavedCart): number {
  return itemCount(saved.lines);
}

/** Un solo dialogo, una sola condizione: si chiede solo se entrambi i lati hanno roba. */
export function needsSwapConfirm(current: Cart, slot: SavedCart | null): boolean {
  return current.length > 0 && slot !== null;
}

/**
 * IL gesto (decisione di prodotto 2): salvare e riprendere sono lo stesso
 * scambio corrente↔salvato. `restored` sono le righe già validate che escono
 * dallo slot (array vuoto quando lo slot è vuoto = salvataggio puro).
 * Nessun ramo può perdere dati: ciò che esce da una parte entra nell'altra.
 */
export function swapCarts(
  current: Cart,
  restored: Cart,
  now: Date
): { cart: Cart; slot: SavedCart | null } {
  return {
    cart: restored,
    slot: current.length > 0 ? snapshotCart(current, now) : null,
  };
}
