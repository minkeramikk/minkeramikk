/**
 * Move one item to another index, always returning a new array.
 * `to` is clamped by splice itself; an out-of-range `from` is a no-op move.
 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next; // nothing pulled out: `from` was out of range
  // Clamped explicitly: bare splice reads a negative index as "from the end",
  // which would silently drop an item one slot short of the front.
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}
