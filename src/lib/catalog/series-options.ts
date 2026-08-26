/**
 * R4-STEP3: distinct series values already in use, for the admin product
 * form's datalist — picking an existing value avoids a typo that would
 * silently create a duplicate section on the public step-3 grid.
 */
export function distinctSeries(
  rows: { series_no: string | null; series_en: string | null }[] | null | undefined
): string[] {
  const values = (rows ?? []).flatMap((r) => [r.series_no, r.series_en]);
  return [...new Set(values.filter((v): v is string => !!v?.trim()))].sort();
}
