/**
 * R5-KIT fix 8 — the kit's shop-window context, carried through the whole
 * journey in sessionStorage (PM 23/9).
 *
 * Why storage and not the URL: the image is a Storage path (long) and the
 * label is admin copy (newlines, emoji) — both travel badly as params, and
 * step 3 is a separate server render that never sees the resolver. The cart
 * already lives in localStorage; the kit context lives beside it for the
 * session only.
 *
 * // ponytail: sessionStorage — the kit lives in the session like the cart
 * // lives in localStorage; if the PM wants it to survive closing the tab,
 * // KEY → localStorage.
 */

export interface KitLabel {
  no: string | null;
  en: string | null;
}

export interface KitContext {
  label: KitLabel | null;
  image: string | null;
  custom: boolean;
}

const KEY = "mk-kit-v1";

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveKitContext(ctx: KitContext): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(ctx));
  } catch {
    /* private mode / quota — the journey keeps the generic fallback */
  }
}

export function readKitContext(): KitContext | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<KitContext>;
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      label:
        parsed.label &&
        typeof parsed.label === "object" &&
        (typeof parsed.label.no === "string" || parsed.label.no === null) &&
        (typeof parsed.label.en === "string" || parsed.label.en === null)
          ? { no: parsed.label.no, en: parsed.label.en }
          : null,
      image: typeof parsed.image === "string" ? parsed.image : null,
      custom: parsed.custom === true,
    };
  } catch {
    return null;
  }
}

/**
 * The strip/welcome title: the featured label in the active locale, then the
 * other language, then the generic fallback (a kit with no shop-window row,
 * e.g. a hand-made share link).
 */
export function kitTitle(
  ctx: KitContext | null,
  locale: "no" | "en",
  fallback: string
): string {
  const label = ctx?.label;
  if (label) {
    const first = locale === "no" ? label.no : label.en;
    if (first) return first;
    const second = locale === "no" ? label.en : label.no;
    if (second) return second;
  }
  return fallback;
}
