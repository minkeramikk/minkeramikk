/**
 * R4-FIX 8 (superata da R5-TEXT-POSITION, 0.1-1) — «Tekst på keramikken» come
 * OPZIONE, non come campo sempre acceso.
 *
 * Il gruppo «Tekst» non governa più il campo: con il flag pulito in
 * back-office (`acceptsCustomText`, R5-TEXT-POSITION) l'euristica sul nome
 * del gruppo è superflua, e un gruppo VUOTO (0 opzioni, il caso normale ora
 * che lo studio non disegna più la parola come layer) avrebbe fatto sparire
 * il campo — `options[0]` è `undefined`, quindi nessuna opzione è mai
 * "diversa dalla prima". `findTextGroup` resta solo per l'etichetta
 * dell'admin tree («0 options · kept for code stability», GARANZIA §7).
 */

/** Nomi accettati per il gruppo-scritta, normalizzati. */
export const TEXT_GROUP_NAMES = ["tekst", "text"];

/** minuscolo, senza diacritici, senza spazi ai bordi. */
export function normalizeGroupName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

/** Il minimo che serve qui di una categoria: come si chiama e che opzioni ha. */
export interface TextGroupCandidate {
  slug: string;
  labelNo: string | null;
  labelEn: string | null;
  options: { id: string }[];
}

/** Il gruppo che governa la scritta, o `null` se il design non ne ha uno. */
export function findTextGroup<T extends TextGroupCandidate>(
  categories: readonly T[]
): T | null {
  return (
    categories.find((c) =>
      [c.slug, c.labelNo, c.labelEn].some((name) =>
        TEXT_GROUP_NAMES.includes(normalizeGroupName(name))
      )
    ) ?? null
  );
}

/** Il campo scritta va mostrato? Solo il flag del design conta ora. */
export function isCustomTextOffered({
  acceptsCustomText,
}: {
  acceptsCustomText: boolean;
}): boolean {
  return acceptsCustomText;
}
