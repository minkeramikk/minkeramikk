/**
 * Cart domain (F03). Pure, serializable, no React, no localStorage here —
 * the hook (use-cart.ts) handles persistence. All money arithmetic goes
 * through the Money value object (ADR 0005): lines store primitive
 * cents+currency (JSON-friendly) and reconstruct Money for totals.
 *
 * Lines can mix suppliers (ADR 0007); a single currency is assumed per cart
 * (sum() refuses cross-currency by design).
 */
import { money, multiply, sum, type Currency, type Money } from "@/lib/money/money";

/** Human-readable summary of the configured design on a cart line. */
export interface ConfigSnapshot {
  designSlug: string;
  designName: string;
  /**
   * R2-7 — design name frozen per-locale at add-time, mirroring
   * productNameNo/En on the line. Optional/back-compatible: snapshots saved
   * before R2-7 (and historic orders) lack them → display falls back to the
   * legacy `designName` via designLabel().
   */
  designNameNo?: string;
  designNameEn?: string;
  /**
   * One entry per category: what the customer picked. `label` is the
   * Norwegian category label (the canonical one — orders/F08 lab PDF read
   * it); `labelEn` is optional/back-compatible (CA-3: the expanded cart row
   * is bilingual). Option names are single-column in the DB.
   */
  selections: {
    label: string;
    labelEn?: string;
    option: string;
    hex: string | null;
  }[];
  /**
   * R2-2b — the customer's free-text colour note. Present (possibly "") only on
   * designs that accept notes (`acceptsCustomNotes`); absent otherwise. ""/absent
   * mean "studio's complementary colours". Does NOT travel in the config code or
   * the `set=` link (lean) — it lives only in the order snapshot.
   */
  customNote?: string;
  /**
   * F38 — the customer's inscription to realise on the ceramic. Present
   * (non-empty) only on designs that accept text (`acceptsCustomText`); absent
   * otherwise. Twin of `customNote` but literal words, not colour instructions.
   * Does NOT travel in the config code or the set= link (lean + privacy).
   */
  customText?: string;
}

/**
 * One composited preview layer (F19), JSON-friendly so it persists in
 * localStorage. Same shape PreviewCanvas consumes: a (pre-coloured) image
 * URL, `recolor` → blend with multiply. Resolved at add-time from the layers
 * the big preview already used (ADR 0002/0010), so the cart row re-renders a
 * mini composited plate with no server compositing.
 */
export interface CartLayer {
  src: string;
  recolor?: boolean;
}

export interface CartLine {
  /** Stable identity = productId + configCode (same config merges quantity). */
  id: string;
  productId: string;
  productNameNo: string;
  productNameEn: string;
  supplierId: string;
  supplierName: string;
  unitPriceCents: number;
  currency: Currency;
  quantity: number;
  /**
   * Reloadable configurator code. `null` = an UNPAINTED line (R5-UNPAINTED):
   * the ceramic is in the basket at full price and the colours are chosen
   * later. `configSnapshot` and `layers` are null/absent on such a line; the
   * gate against ordering one lives on the ORDER, not on the cart.
   */
  configCode: string | null;
  configSnapshot: ConfigSnapshot | null;
  /**
   * F19 — the DESIGN pattern layers (no plate) for the mini composited preview
   * in the cart row, multiply-stacked over a light tile (clean centre, like the
   * step 1–2 preview). Optional: lines saved before F19 lack it and the row
   * falls back to the colour chip. No migration.
   */
  layers?: CartLayer[];
  /**
   * F19 — the chosen ceramic photo (resolved URL), shown as a small separate
   * thumbnail under the pattern. Optional/back-compatible like `layers`.
   */
  plateImage?: string;
  /**
   * CA-3 — the ceramic's public slug, so the line can travel in a share link
   * (the link carries slugs, never internal ids). Optional/back-compatible
   * like `layers`: legacy lines without it are excluded from the link with a
   * notice — carts are ephemeral, not worth a resolver.
   */
  productSlug?: string;
  /**
   * F29 — pieces in the chosen ceramic (>1 → "Sett · N deler" badge).
   * Optional/back-compatible like `layers`: legacy lines without it show no
   * badge, no error. No migration.
   */
  pieces?: number;
  /**
   * R4-SCONTI ② — the automation rule this line was added from. Only the ID
   * travels: the percentage is looked up from the live config (browser) and
   * re-derived from the DB (server), so a stale localStorage cart can never
   * dictate a price. Optional/back-compatible like `layers`: no migration.
   */
  dealRuleId?: string;
  /**
   * R5-PALETTES §4-bis — the ceramic's own dimensional attribute (e.g.
   * "Ø 26 cm"), frozen at add-time. A PAIR, not one localised string: mirrors
   * `productNameNo`/`productNameEn` (R2-7) for the exact same reason — a
   * single string would freeze the row into whichever language it was added
   * in, and the cart is read in both. Optional/back-compatible like `layers`:
   * a line saved before this field existed simply has neither, and the row
   * prints no stray "·" for it. No migration.
   */
  sizeLabelNo?: string;
  sizeLabelEn?: string;
}

export type Cart = CartLine[];

export type NewCartLine = Omit<CartLine, "id" | "quantity"> & {
  quantity?: number;
};

/** The key half of an unpainted line's id — one such line per product. */
const UNPAINTED_KEY = "unpainted";

export function lineKey(productId: string, configCode: string | null): string {
  return `${productId}::${configCode ?? UNPAINTED_KEY}`;
}

/** Add a line; if an identical (product + config) line exists, merge quantity. */
export function addToCart(cart: Cart, line: NewCartLine): Cart {
  const id = lineKey(line.productId, line.configCode);
  const qty = line.quantity ?? 1;
  const existing = cart.find((l) => l.id === id);
  if (existing) {
    return cart.map((l) =>
      l.id === id ? { ...l, quantity: l.quantity + qty } : l
    );
  }
  return [...cart, { ...line, id, quantity: qty }];
}

/**
 * Fold several lines into the cart, one after another. The bundle add (a
 * configured ceramic plus its discounted upsell) must be ONE state update, so
 * the fold lives here as a pure function: the hook only hands it to setCart,
 * and the merge stays the reducer's business rather than growing a second,
 * divergent way of putting a line in the cart.
 */
export function addManyToCart(cart: Cart, lines: NewCartLine[]): Cart {
  return lines.reduce((acc, l) => addToCart(acc, l), cart);
}

/** Set a line's quantity; quantity ≤ 0 removes the line. */
export function updateQuantity(cart: Cart, id: string, quantity: number): Cart {
  if (quantity <= 0) return removeLine(cart, id);
  return cart.map((l) => (l.id === id ? { ...l, quantity } : l));
}

export function removeLine(cart: Cart, id: string): Cart {
  return cart.filter((l) => l.id !== id);
}

/**
 * Shared plumbing for `paintLines`/`unpaintLines`: shrink the source line to
 * `remaining` and land `moved` pieces on `dest` (everything the destination
 * line needs, quantity aside). `addToCart`'s merge-or-append is right in every
 * case except one: source emptied + no destination line yet, where a plain
 * append would drop the new line at the bottom of the basket. That one case
 * gets the source's own array index instead, so painting/unpainting a whole
 * row leaves it exactly where the customer touched it.
 */
function moveQuantity(
  cart: Cart,
  lineId: string,
  remaining: number,
  moved: number,
  dest: NewCartLine
): Cart {
  const srcIndex = cart.findIndex((l) => l.id === lineId);
  const rest = updateQuantity(cart, lineId, remaining);
  const newLine = { ...dest, quantity: moved };
  if (remaining > 0) return addToCart(rest, newLine);

  const destId = lineKey(dest.productId, dest.configCode);
  if (rest.some((l) => l.id === destId)) return addToCart(rest, newLine);

  const withDest = [...rest];
  withDest.splice(srcIndex, 0, { ...newLine, id: destId });
  return withDest;
}

/**
 * R5-UNPAINTED — move `n` pieces off a line onto the SAME product wearing
 * `configCode`. Pure and total: the moved pieces are clamped to what the line
 * holds, the source disappears when it empties, and the destination merges
 * through `addToCart` when it already exists. Painting is therefore just a
 * transfer — the price, the pieces and the discount never move. When the
 * source empties into a destination that doesn't exist yet, the new line
 * takes the source's own array index (see `moveQuantity`) instead of
 * teleporting to the bottom of the basket.
 */
export function paintLines(
  cart: Cart,
  lineId: string,
  n: number,
  configCode: string,
  configSnapshot: ConfigSnapshot | null,
  layers?: CartLayer[]
): Cart {
  const src = cart.find((l) => l.id === lineId);
  if (!src || n <= 0) return cart;
  const moved = Math.min(n, src.quantity);
  return moveQuantity(cart, lineId, src.quantity - moved, moved, {
    ...src,
    configCode,
    configSnapshot,
    layers,
  });
}

/**
 * The inverse: `n` pieces go back to the product's unpainted line, colours
 * off. Same index-preserving move as `paintLines` (see `moveQuantity`) when
 * the source empties into a destination that doesn't exist yet.
 */
export function unpaintLines(cart: Cart, lineId: string, n: number): Cart {
  const src = cart.find((l) => l.id === lineId);
  if (!src || n <= 0 || src.configCode === null) return cart;
  const moved = Math.min(n, src.quantity);
  return moveQuantity(cart, lineId, src.quantity - moved, moved, {
    ...src,
    configCode: null,
    configSnapshot: null,
    // `layers` is what a row would composite; an unpainted row has nothing to
    // composite. Explicit, because the spread above would carry them over.
    layers: undefined,
  });
}

// M3, fix wave: zero production callers since R4-SCONTI (computeCartDiscount
// owns the discounted totals now) — retained only because cart.test.ts and
// shipping.test.ts still exercise these two directly.
export function lineSubtotal(line: CartLine): Money {
  return multiply(money(line.unitPriceCents, line.currency), line.quantity);
}

/** Grand total as Money (cents). Throws on cross-currency carts (ADR 0005). */
export function cartTotal(cart: Cart): Money {
  if (cart.length === 0) return money(0);
  return sum(cart.map(lineSubtotal), cart[0].currency);
}

export function itemCount(cart: Cart): number {
  return cart.reduce((n, l) => n + l.quantity, 0);
}

/**
 * R4-CTA-STICKY — physical pieces in the basket, not lines: the mobile order
 * bar says «Din bestilling · N deler», and one line can be a set (F29).
 *
 * `pieces` is optional on the line, so rows saved before F29 (and any legacy
 * `?set=` payload) count as the single item they were.
 */
export function cartPieces(cart: Cart): number {
  return cart.reduce((n, l) => n + (l.pieces ?? 1) * l.quantity, 0);
}

/**
 * R2-7 — resolve a snapshot's design name for the given locale, falling back to
 * the legacy single `designName` so historic orders (saved before the bilingual
 * split) stay readable. Returns null when no name is present at all; callers
 * render "—" in that case. Structural input so both ConfigSnapshot and the
 * admin OrderConfigSnapshot can use it.
 */
export function designLabel(
  snapshot:
    | { designName?: string; designNameNo?: string; designNameEn?: string }
    | null
    | undefined,
  locale: "no" | "en"
): string | null {
  if (!snapshot) return null;
  const localized = locale === "no" ? snapshot.designNameNo : snapshot.designNameEn;
  return localized ?? snapshot.designName ?? null;
}

/**
 * R5-UNPAINTED — physical pieces with no colours yet. Pieces, not lines: the
 * basket box, the header marker and the CTA all say «N pieces», and one line
 * can be a set of N (F29), exactly like `cartPieces`.
 */
export function unpaintedPieces(cart: Cart): number {
  return cart.reduce(
    (n, l) => n + (l.configCode === null ? (l.pieces ?? 1) * l.quantity : 0),
    0
  );
}
