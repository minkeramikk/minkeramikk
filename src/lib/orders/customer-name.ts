/**
 * R4-MAIL-COPY Ⓐ: how a customer's name is RENDERED. Nothing writes this back —
 * the DB keeps the name exactly as it was typed («daniele d'angeli»), and only
 * the greeting in the mails and the «Leveres til» line in the PDF go through
 * here. Pure, so it works in a mail rendered outside any request context.
 *
 * Only the FIRST letter of each word is touched; the rest is left alone, so a
 * name written in caps stays in caps («KARI»), never «Kari» — we are fixing a
 * missing capital, not deciding how someone spells their own name.
 */

/** Word boundaries that carry a capital in Norwegian and Italian names alike:
 *  the start, after a space, and after the two joiners that are INSIDE a name
 *  («Anne-Lise», «D'Angeli»). */
const START_OF_WORD = /(^|[\s\-'’])(\p{L})/gu;

export function displayName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(START_OF_WORD, (_, sep: string, first: string) => sep + first.toUpperCase());
}
