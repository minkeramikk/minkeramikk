/**
 * Pure rules for the supplier glaze-palette editor (F35). No I/O — unit-tested.
 * Mirrors the DB guarantees: UNIQUE(supplier_id, hex) / UNIQUE(supplier_id, name)
 * (0022) are enforced in Postgres; these give friendly messages before the DB.
 */
import { parseHex } from "./option-rules";

export interface PaletteImportRow {
  hex: string;
  name: string;
}

/** Parse a paste-import textarea: one `#hex;Name` per line. Blank lines are
 *  skipped; a line without `;`, a bad hex, or an empty name becomes an error
 *  (with its 1-based line number), never a row. Hex is lowercased. */
export function parsePaletteImport(text: string): {
  rows: PaletteImportRow[];
  errors: string[];
} {
  const rows: PaletteImportRow[] = [];
  const errors: string[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === "") continue;
    const sep = raw.indexOf(";");
    if (sep === -1) {
      errors.push(`Line ${i + 1}: expected "#hex;Name" — no ";" found.`);
      continue;
    }
    const hexPart = raw.slice(0, sep).trim();
    const name = raw.slice(sep + 1).trim();
    const p = parseHex(hexPart);
    if (!p.ok || !p.hex) {
      errors.push(`Line ${i + 1}: "${hexPart}" is not a valid #rrggbb hex.`);
      continue;
    }
    if (name === "") {
      errors.push(`Line ${i + 1}: missing colour name.`);
      continue;
    }
    rows.push({ hex: p.hex, name });
  }

  return { rows, errors };
}

/** What the save action reports back per row so the inline editor can reconcile
 *  its client state with what the server actually wrote (no reload). */
export interface ResolvedPaletteRow {
  key: string;
  id: string;
  swatchImage: string | null;
  swatchUrl: string | null;
}

/** Patch editor rows (by stable `key`) with the ids + swatch paths the server
 *  persisted, so a second save reuses the same ids and keeps the uploaded
 *  swatch instead of re-inserting new rows / dropping the image. Pure. */
export function mergeResolvedRows<T extends { key: string }>(
  rows: T[],
  resolved: ResolvedPaletteRow[]
): T[] {
  const byKey = new Map(resolved.map((r) => [r.key, r]));
  return rows.map((r) => {
    const m = byKey.get(r.key);
    return m
      ? { ...r, id: m.id, swatchImage: m.swatchImage, swatchUrl: m.swatchUrl }
      : r;
  });
}

/** Map a Postgres unique-violation (0022 supplier_colors indexes) to a message. */
export function duplicatePaletteMessage(constraintText: string): string {
  if (constraintText.includes("hex"))
    return "A colour with this hex already exists for this supplier.";
  if (constraintText.includes("name"))
    return "A colour with this name already exists for this supplier.";
  return "This colour duplicates an existing one for this supplier.";
}
