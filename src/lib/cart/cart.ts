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
  /** Reloadable configurator code (interim: the configurator query string; F04 formalizes). */
  configCode: string;
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
}

export type Cart = CartLine[];

export type NewCartLine = Omit<CartLine, "id" | "quantity"> & {
  quantity?: number;
};

export function lineKey(productId: string, configCode: string): string {
  return `${productId}::${configCode}`;
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

/** Set a line's quantity; quantity ≤ 0 removes the line. */
export function updateQuantity(cart: Cart, id: string, quantity: number): Cart {
  if (quantity <= 0) return removeLine(cart, id);
  return cart.map((l) => (l.id === id ? { ...l, quantity } : l));
}

export function removeLine(cart: Cart, id: string): Cart {
  return cart.filter((l) => l.id !== id);
}

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
