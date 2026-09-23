import { cartPieces, unpaintedPieces, type Cart } from "@/lib/cart/cart";

/** The two numbers both kit landings feed `KitStrip` with. */
export function kitStripCounts(cart: Cart): { total: number; painted: number } {
  const total = cartPieces(cart);
  return { total, painted: total - unpaintedPieces(cart) };
}

/**
 * The kit label rides step 2 → step 3 in the URL (`kitlabel=`), because step 3
 * is a separate server render that never sees the resolver. Base64 of
 * "no\nen" — labels are admin copy, short, and never contain a newline.
 *
 * Server-safe on purpose: page.tsx (a server component) decodes this, so it
 * lives here WITHOUT "use client" — next-intl's useTranslations would throw
 * outside a client bundle (that is what broke step 3).
 */
export function encodeKitLabel(label: { no: string; en: string }): string {
  const bytes = new TextEncoder().encode(`${label.no}\n${label.en}`);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Inverse of `encodeKitLabel`; null on anything malformed. */
export function decodeKitLabel(raw: string | null | undefined): {
  no: string;
  en: string;
} | null {
  if (!raw) return null;
  try {
    const bin = atob(raw);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const [no, en] = new TextDecoder().decode(bytes).split("\n");
    return no && en ? { no, en } : null;
  } catch {
    return null;
  }
}
