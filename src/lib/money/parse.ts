/**
 * Parse a human-typed price in kroner into integer cents (øre) — F09.
 *
 * Accepts what an admin actually types: plain integers ("1500"), thousands
 * separators as spaces incl. NBSP/thin space ("1 500"), and a decimal part with
 * either a comma (Norwegian) or a dot ("1500,50" / "1500.50"). At most two
 * decimals. Never uses floating point for the conversion (avoids 19.99 → 1998).
 *
 * Returns null for anything ambiguous or invalid (empty, negative, non-numeric,
 * more than two decimals, multiple separators) so the form can reject it.
 */
export function parsePriceToCents(raw: string): number | null {
  if (typeof raw !== "string") return null;

  // strip all whitespace (regular, NBSP  , narrow NBSP  , thin  )
  const cleaned = raw.replace(/[\s   ]/g, "");
  if (cleaned === "") return null;

  // unify the decimal separator to a dot; reject if both are present
  if (cleaned.includes(",") && cleaned.includes(".")) return null;
  const normalized = cleaned.replace(",", ".");

  // digits, optional single dot + 1–2 decimals. No sign, no exponent.
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const [kronerPart, fracPart = ""] = normalized.split(".");
  const kroner = Number(kronerPart);
  const ore = Number(fracPart.padEnd(2, "0")); // "5" → "50", "" → "00"

  const cents = kroner * 100 + ore;
  return Number.isSafeInteger(cents) ? cents : null;
}
