/**
 * R4-FIX 8 — «Tekst på keramikken» come OPZIONE, non come campo sempre acceso.
 *
 * Il campo compare solo quando l'utente, nel gruppo che governa la scritta, ha
 * scelto un'opzione diversa dalla prima (la prima è per convenzione «nessun
 * testo»). Il gruppo si riconosce dal NOME — slug o etichetta NO/EN — perché in
 * catalogo non esiste un flag per questo: il flag pulito in back-office è a
 * backlog, e finché non c'è questa è l'unica informazione disponibile.
 *
 * Fallback esplicito: design con `accepts_custom_text` ma SENZA un gruppo così
 * → campo sempre visibile, cioè il comportamento storico. Meglio un campo di
 * troppo che una scritta che il cliente non può più chiedere.
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

/**
 * Il campo scritta va mostrato? `selectedOptionId` è la scelta corrente nel
 * gruppo-scritta (da URL/`selections`).
 */
export function isCustomTextOffered({
  acceptsCustomText,
  textGroup,
  selectedOptionId,
}: {
  acceptsCustomText: boolean;
  textGroup: TextGroupCandidate | null;
  selectedOptionId: string | undefined;
}): boolean {
  if (!acceptsCustomText) return false;
  // niente gruppo → comportamento storico
  if (!textGroup) return true;
  const noTextOption = textGroup.options[0]?.id;
  return Boolean(selectedOptionId) && selectedOptionId !== noTextOption;
}
