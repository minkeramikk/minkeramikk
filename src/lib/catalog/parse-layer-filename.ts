/**
 * F35 · Pure filename→hex parser + palette matcher for the bulk layer import.
 * No I/O — unit-tested. The `#` lives ONLY in the client-side filename; it is
 * never written to a Storage path (card §8). Hex is normalised to "#rrggbb".
 */

const HASH_HEX = /#([0-9a-f]{6})/i; // a #hex anywhere in the name
const EXT = /\.(png|jpe?g|webp)$/i;
const TRAILING_TOKEN = /(?:^|_)([0-9a-f]{6})$/i; // last _-token of exactly 6 hex, no '#'

export type ParseResult = { hex: string } | { error: "no-hex" };

export function parseLayerFilename(name: string): ParseResult {
  const hash = name.match(HASH_HEX);
  if (hash) return { hex: `#${hash[1].toLowerCase()}` };

  const stem = name.replace(EXT, "");
  const tok = stem.match(TRAILING_TOKEN);
  if (tok) return { hex: `#${tok[1].toLowerCase()}` };

  return { error: "no-hex" };
}

export interface PaletteColorRef {
  hex: string;
}

export interface MatchResult {
  /** first occurrence of each palette hex */
  matched: { name: string; hex: string }[];
  unmatched: { name: string; reason: "no-hex" | "not-in-palette" }[];
  /** 2nd+ file for a hex already matched in this batch */
  duplicates: { name: string; hex: string }[];
  /** palette hexes with zero matched files (card §8.4: "colours not covered") */
  uncoveredPaletteHexes: string[];
}

export function matchPalette(
  files: { name: string }[],
  palette: PaletteColorRef[]
): MatchResult {
  const paletteHexes = new Set(palette.map((p) => p.hex.toLowerCase()));
  const out: MatchResult = {
    matched: [],
    unmatched: [],
    duplicates: [],
    uncoveredPaletteHexes: [],
  };
  const seen = new Set<string>();

  for (const f of files) {
    const r = parseLayerFilename(f.name);
    if ("error" in r) {
      out.unmatched.push({ name: f.name, reason: "no-hex" });
      continue;
    }
    if (!paletteHexes.has(r.hex)) {
      out.unmatched.push({ name: f.name, reason: "not-in-palette" });
      continue;
    }
    if (seen.has(r.hex)) {
      out.duplicates.push({ name: f.name, hex: r.hex });
      continue;
    }
    seen.add(r.hex);
    out.matched.push({ name: f.name, hex: r.hex });
  }

  out.uncoveredPaletteHexes = [...paletteHexes].filter((h) => !seen.has(h));
  return out;
}
