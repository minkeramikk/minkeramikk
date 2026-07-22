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
import { addToCart, itemCount, lineKey, type Cart, type CartLine } from "./cart";

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

/**
 * Esito di validazione di UNA riga salvata, così come arriva da
 * `POST /api/cart/validate`. `line` è la riga ricostruita viva dal catalogo
 * (prezzo, nomi, layers canonici), senza identità locale: l'id si ricalcola qui.
 * I flag dicono se il design accetta ANCORA nota colore e scritta: i campi
 * personali non vengono mai mandati al server, li riattacca il client.
 */
export type ValidatedEntry =
  | {
      ok: true;
      line: Omit<CartLine, "id">;
      acceptsCustomNotes: boolean;
      acceptsCustomText: boolean;
    }
  | { ok: false; reason: "design" | "product" | "code" };

export interface RestoreIssue {
  /** La riga SALVATA (non quella viva): è ciò che l'utente riconosce. */
  line: CartLine;
}

export interface RestoreReport {
  removed: (RestoreIssue & { reason: "design" | "product" | "code" })[];
  adapted: (RestoreIssue & { changes: ("options" | "note" | "text")[] })[];
}

/**
 * Fonde le righe salvate con l'esito della validazione (AC5): le valide
 * rientrano nel carrello, le altre finiscono nel report — mai scartate in
 * silenzio. Puro: la fetch la fa il chiamante.
 */
export function buildRestoredCart(
  saved: SavedCart,
  results: ValidatedEntry[]
): { cart: Cart; report: RestoreReport } {
  const report: RestoreReport = { removed: [], adapted: [] };
  let cart: Cart = [];

  saved.lines.forEach((savedLine, i) => {
    const result = results[i];
    if (!result || !result.ok) {
      // risposta assente/corta = riga non risolta: si segnala, non si crasha
      report.removed.push({ line: savedLine, reason: result?.reason ?? "design" });
      return;
    }

    const changes: RestoreReport["adapted"][number]["changes"] = [];
    if (result.line.configCode !== savedLine.configCode) changes.push("options");

    const snapshot = result.line.configSnapshot
      ? { ...result.line.configSnapshot }
      : null;
    const note = savedLine.configSnapshot?.customNote;
    const text = savedLine.configSnapshot?.customText;
    if (note !== undefined) {
      if (result.acceptsCustomNotes && snapshot) snapshot.customNote = note;
      else changes.push("note");
    }
    if (text !== undefined) {
      if (result.acceptsCustomText && snapshot) snapshot.customText = text;
      else changes.push("text");
    }
    if (changes.length > 0) report.adapted.push({ line: savedLine, changes });

    // quantità dallo slot (il server non la decide), identità ricalcolata dal
    // codice canonico: due righe adattate sullo stesso config si fondono.
    cart = addToCart(cart, {
      ...result.line,
      configSnapshot: snapshot,
      quantity: savedLine.quantity,
    });
  });

  return { cart, report };
}
