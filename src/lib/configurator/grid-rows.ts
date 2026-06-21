/**
 * R2-3+R2-4 (Part B) — where to insert the full-row expanded panel in the
 * step-3 grid: right after the LAST card of the selected card's row, so the
 * panel spans `grid-column: 1 / -1` without splitting the row (the R2-3
 * mechanic). `cols` is the live column count (2 under sm, 3 from sm). Returns
 * -1 when nothing is selected.
 */
export function fullRowInsertIndex(
  selectedIndex: number,
  cols: number,
  total: number
): number {
  if (selectedIndex < 0) return -1;
  const rowStart = Math.floor(selectedIndex / cols) * cols;
  return Math.min(rowStart + cols - 1, total - 1);
}
