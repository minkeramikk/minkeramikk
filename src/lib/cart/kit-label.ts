import { cartPieces, unpaintedPieces, type Cart } from "@/lib/cart/cart";

/** The two numbers both kit landings feed `KitStrip` with. */
export function kitStripCounts(cart: Cart): { total: number; painted: number } {
  const total = cartPieces(cart);
  return { total, painted: total - unpaintedPieces(cart) };
}
