"use client";

import { useCallback, useEffect, useState } from "react";
import { renamePalette, savePalette, touchPalette, type Palette } from "./palettes";

const LIST_KEY = "mk-palettes-v1";
const ACTIVE_KEY = "mk-palette-active-v1";

function loadPalettes(): Palette[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Palette[]) : [];
  } catch {
    return [];
  }
}

function loadActiveCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

/**
 * Named-palette persistence (R5-PALETTES). Same shape as `use-cart.ts`:
 * hydrate after mount (never during render, or the server and the client
 * disagree), write through on every change, listen to `storage` so two tabs
 * stay in sync. Every RULE (dedup, eviction, rename) lives in `palettes.ts`
 * — this hook holds none of its own, it only persists whatever the pure
 * functions return and tracks which code is active.
 */
export function usePalettes() {
  const [palettes, setPalettes] = useState<Palette[]>([]);
  const [activeCode, setActiveCodeState] = useState<string | null>(null);
  // Named `palettesHydrated`, not `hydrated`: this hook's return is spread into
  // the same CartApi object as `useCart`'s (cart-context.tsx), which returns
  // its OWN `hydrated` — a same-named field here would silently shadow it, and
  // that flag is load-bearing (it keeps the cart badge/counts quiet pre-hydration).
  const [palettesHydrated, setPalettesHydrated] = useState(false);

  useEffect(() => {
    setPalettes(loadPalettes());
    setActiveCodeState(loadActiveCode());
    setPalettesHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === LIST_KEY) setPalettes(loadPalettes());
      if (e.key === ACTIVE_KEY) setActiveCodeState(loadActiveCode());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!palettesHydrated) return;
    window.localStorage.setItem(LIST_KEY, JSON.stringify(palettes));
  }, [palettes, palettesHydrated]);

  useEffect(() => {
    if (!palettesHydrated) return;
    if (activeCode === null) window.localStorage.removeItem(ACTIVE_KEY);
    else window.localStorage.setItem(ACTIVE_KEY, activeCode);
  }, [activeCode, palettesHydrated]);

  const setActiveCode = useCallback((code: string | null) => {
    setActiveCodeState(code);
  }, []);

  const save = useCallback(
    (p: Palette) => {
      // Computed OUTSIDE the setState updater (unlike `rename`/`touch` below)
      // and written to `window` right here — not inside the updater — because
      // React 18 Strict Mode double-invokes an updater function in dev to
      // surface side effects, and a localStorage write is exactly the side
      // effect it's looking for. Same shape as `use-cart.ts`'s `clear()`.
      const next = savePalette(palettes, p);
      setPalettes(next);
      // Persist SYNCHRONOUSLY: the effect above writes on the NEXT render,
      // but step 2's "Save as palette" can be followed by a `router.push`
      // (Next, or a chip tap) before that render happens — the navigation
      // would unmount this hook first, dropping the save. Carried from PR
      // 1's review (task 8 step 2).
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LIST_KEY, JSON.stringify(next));
      }
    },
    [palettes]
  );
  const rename = useCallback((code: string, name: string) => {
    setPalettes((list) => renamePalette(list, code, name));
  }, []);
  const touch = useCallback((code: string, at: number) => {
    setPalettes((list) => touchPalette(list, code, at));
  }, []);

  return { palettes, palettesHydrated, activeCode, setActiveCode, save, rename, touch };
}
