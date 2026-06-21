/**
 * R2-4 — structured product weight in grams, parked for the future shipping
 * calc (ADR 0015). Pure parse of the admin form field: empty → null (clears
 * the column), a non-negative integer → that number, anything else → undefined
 * (the server action turns undefined into a user-facing error).
 */
export function parseWeightG(
  raw: FormDataEntryValue | null
): number | null | undefined {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  if (!/^\d+$/.test(s)) return undefined;
  return Number(s);
}
