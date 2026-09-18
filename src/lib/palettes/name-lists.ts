/**
 * Word lists for palette naming (R5-PALETTES, ADR 0012). These are the
 * supplier's own colour vocabulary — Italian maiolica pigment/earth names —
 * and are deliberately NOT localised: they never go through next-intl and
 * never enter src/i18n/messages/*, on any locale.
 *
 * MK_PALETTE_WORDS lets the shop swap the whole list from a Vercel env var
 * without a redeploy of code. It is operator-facing (a typo is a fat-finger
 * in a dashboard, not a code review), so the reader here is defensive to the
 * point of dullness: parse in a try/catch, validate the shape, and on ANY
 * problem log one warning and fall back to DEFAULT_WORDS. It must never
 * throw — this runs in production, on the request path.
 */
export type PaletteFamily = "blue" | "green" | "red" | "yellow" | "purple" | "neutral";
export type PaletteWords = Record<PaletteFamily, string[]>;

const FAMILIES: PaletteFamily[] = ["blue", "green", "red", "yellow", "purple", "neutral"];

// The maiolica pigments (card §2). `neutral` picks five in the same
// register — pigments/earths, single word, no colour repeated elsewhere:
// Bianco (tin-glaze white, the maiolica base), Grafite (graphite grey),
// Avorio (ivory), Tortora (dove-grey/taupe), Biscotto (the unglazed bisque
// tone — ceramics' own word for it).
export const DEFAULT_WORDS: PaletteWords = {
  blue: ["Cobalto", "Zaffera", "Turchino", "Bleu", "Persia"],
  green: ["Ramina", "Oliva", "Pistacchio", "Alloro", "Salvia"],
  red: ["Corallo", "Terracotta", "Rubino", "Melagrana", "Ferro"],
  yellow: ["Zafferano", "Antimonio", "Ocra", "Limone", "Ambra"],
  purple: ["Manganese", "Glicine", "Lavanda", "Iris", "Melanzana"],
  neutral: ["Bianco", "Grafite", "Avorio", "Tortora", "Biscotto"],
};

// Kept ready, not wired up: a "città della costiera" variant, if the shop
// ever wants it instead (set via MK_PALETTE_WORDS, same shape as above,
// same five-per-family count is NOT required — any non-empty list works):
// blue: ["Vietri", "Amalfi", "Positano", "Capri", "Ravello"]
// (…and so on per family; the card names Vietri, Amalfi, Positano, Capri,
// Ravello, Cetara, Sorrento as the flavour, not a fixed per-family split.)

function isValidPaletteWords(x: unknown): x is PaletteWords {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  const obj = x as Record<string, unknown>;
  return FAMILIES.every((f) => {
    const list = obj[f];
    return (
      Array.isArray(list) &&
      list.length > 0 &&
      list.every((w) => typeof w === "string" && w.length > 0)
    );
  });
}

/** DEFAULT_WORDS, or a valid MK_PALETTE_WORDS override. Never throws. */
export function paletteWords(): PaletteWords {
  const raw = process.env.MK_PALETTE_WORDS;
  if (!raw) return DEFAULT_WORDS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("MK_PALETTE_WORDS: not valid JSON, using the built-in word lists");
    return DEFAULT_WORDS;
  }

  if (!isValidPaletteWords(parsed)) {
    console.warn(
      "MK_PALETTE_WORDS: wrong shape (every family needs a non-empty list of non-empty strings), using the built-in word lists"
    );
    return DEFAULT_WORDS;
  }
  return parsed;
}
