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
  return window.localStorage.getItem(ACTIVE_KEY);
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
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPalettes(loadPalettes());
    setActiveCodeState(loadActiveCode());
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === LIST_KEY) setPalettes(loadPalettes());
      if (e.key === ACTIVE_KEY) setActiveCodeState(loadActiveCode());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(LIST_KEY, JSON.stringify(palettes));
  }, [palettes, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (activeCode === null) window.localStorage.removeItem(ACTIVE_KEY);
    else window.localStorage.setItem(ACTIVE_KEY, activeCode);
  }, [activeCode, hydrated]);

  const setActiveCode = useCallback((code: string | null) => {
    setActiveCodeState(code);
  }, []);

  const save = useCallback((p: Palette) => {
    setPalettes((list) => savePalette(list, p));
  }, []);
  const rename = useCallback((code: string, name: string) => {
    setPalettes((list) => renamePalette(list, code, name));
  }, []);
  const touch = useCallback((code: string, at: number) => {
    setPalettes((list) => touchPalette(list, code, at));
  }, []);

  return { palettes, hydrated, activeCode, setActiveCode, save, rename, touch };
}
