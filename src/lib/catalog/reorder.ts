/** Move one item to another index, returning a new array. Target is clamped. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return items;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}
