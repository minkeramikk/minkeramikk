/**
 * R4-I18N — the editable perimeter and the file+override merge. PURE: no DB,
 * no `server-only`.
 *
 * Both the public runtime (`src/i18n/request.ts`) and the admin editor use
 * THIS merge. The editor searches the EFFECTIVE text — files and overrides
 * already merged — and a second implementation would diverge on the first save
 * (card NOTE N5).
 */

export type MessageOverrides = Record<string, string>;

/**
 * The top-level namespaces the editor exposes (AC4). A whitelist, not a
 * blacklist: a technical key added tomorrow stays invisible until somebody
 * lists it here on purpose.
 *
 * Out of it: `_review`, which is not copy but the EN-only marker "English is a
 * draft pending client review" (AGENTS rule 6) that `messages.test.ts` already
 * tolerates — and that test is NOT to be touched (card NOTE N3).
 */
export const EDITABLE_NAMESPACES = [
  "actions",
  "cart",
  "common",
  "configurator",
  "error",
  "footer",
  "home",
  "legal",
  "localeSwitcher",
  "nav",
  "notFound",
  "order",
  "orderForm",
] as const;

export function isEditableKey(key: string): boolean {
  return (EDITABLE_NAMESPACES as readonly string[]).includes(key.split(".")[0]);
}

/** Every string leaf, under next-intl's dotted key. */
export function flattenMessages(
  node: unknown,
  prefix = "",
  out: Record<string, string> = {}
): Record<string, string> {
  if (typeof node === "string") {
    if (prefix) out[prefix] = node;
    return out;
  }
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) {
      flattenMessages(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
}

/** The keys the editor lists, and the only ones the save action accepts. */
export function editableKeys(messages: unknown): string[] {
  return Object.keys(flattenMessages(messages)).filter(isEditableKey);
}

/**
 * Files first, overrides on top. An override lands ONLY on a key that already
 * exists in the files as a string: the editor cannot create a key (NO/EN parity
 * is guarded by the files and by `messages.test.ts`, and a database row must
 * not be able to sidestep it) and cannot replace a node with a string.
 *
 * With no overrides it hands back the base object itself — the normal path
 * pays nothing.
 */
export function mergeOverrides<T>(base: T, overrides: MessageOverrides): T {
  const keys = Object.keys(overrides);
  if (keys.length === 0) return base;

  const merged = structuredClone(base) as Record<string, unknown>;
  for (const key of keys) {
    if (!isEditableKey(key)) continue;
    const path = key.split(".");
    const leaf = path.pop()!;
    let node: Record<string, unknown> | null = merged;
    for (const segment of path) {
      const next: unknown = node[segment];
      node =
        next && typeof next === "object" && !Array.isArray(next)
          ? (next as Record<string, unknown>)
          : null;
      if (!node) break;
    }
    if (node && typeof node[leaf] === "string") node[leaf] = overrides[key];
  }
  return merged as T;
}
