export interface SeriesGrouped<T> {
  /** null = ungrouped: rendered as a trailing section with NO heading. */
  label: string | null;
  items: T[];
}

interface HasSeries {
  seriesNo: string | null;
  seriesEn: string | null;
}

const clean = (s: string | null) => {
  const v = (s ?? "").trim();
  return v.length > 0 ? v : null;
};

/**
 * R4-STEP3: the step-3 grid is grouped by series ("Sett", "Tallerkener", …).
 *
 * ponytail: no section order column — `products` already arrives sorted by the
 * admin's own `sort_order` (F39), so first-appearance order IS the admin's
 * order. Moving "Sett" to the top is the same drag it already is today.
 *
 * The grouping KEY is the NO value (the source of truth the admin fills first);
 * only the LABEL is localised, so a missing `series_en` never splits a section.
 */
export function groupBySeries<T extends HasSeries>(
  products: T[],
  locale: "no" | "en"
): SeriesGrouped<T>[] {
  const byKey = new Map<string, SeriesGrouped<T>>();
  const ungrouped: T[] = [];

  for (const p of products) {
    const key = clean(p.seriesNo) ?? clean(p.seriesEn);
    if (!key) {
      ungrouped.push(p);
      continue;
    }
    const existing = byKey.get(key);
    if (existing) {
      existing.items.push(p);
      // First non-empty localised label wins (a row with only `series_no`
      // filled must not blank out a label another row already provided).
      existing.label ??= locale === "no" ? clean(p.seriesNo) : clean(p.seriesEn);
      continue;
    }
    byKey.set(key, {
      label: locale === "no" ? clean(p.seriesNo) : clean(p.seriesEn),
      items: [p],
    });
  }

  const sections = [...byKey.values()];
  if (ungrouped.length) sections.push({ label: null, items: ungrouped });
  return sections;
}
