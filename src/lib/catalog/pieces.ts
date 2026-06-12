import { z } from "zod";

/**
 * F29 — the "set of N pieces" rule, in one pure place (no React, no DB).
 * `pieces` is a product property: 1 = single item; >1 = a set shown as
 * "Sett · N deler". The admin field and the SetBadge component both go
 * through here so the validation and the >1 decision never drift.
 */
export const piecesSchema = z.coerce
  .number()
  .int()
  .min(1, "Pieces must be at least 1")
  .max(99, "Pieces can be at most 99")
  .default(1);

/**
 * Is this product a set? Robust against undefined/NaN (legacy cart lines
 * saved before F29, stale data): only a genuine count > 1 counts as a set.
 */
export function isSet(pieces: number | null | undefined): boolean {
  return typeof pieces === "number" && pieces > 1;
}
