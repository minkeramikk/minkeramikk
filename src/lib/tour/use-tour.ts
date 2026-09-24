"use client";

import { useCallback, useEffect, useState } from "react";
import { TOUR_DEFAULT, TOUR_KEY, next, parseTourState, start, turnOff, type TourSequence, type TourState } from "./tour";

const TOUR_SYNC_EVENT = "mk-tour-sync";

function load(): TourState {
  if (typeof window === "undefined") return TOUR_DEFAULT;
  try {
    return parseTourState(window.localStorage.getItem(TOUR_KEY));
  } catch {
    return TOUR_DEFAULT;
  }
}

function persist(state: TourState) {
  try {
    window.localStorage.setItem(TOUR_KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota — the tour still works for this render */
  }
  // Round 2 (plan Task A): `storage` only fires in OTHER tabs — a second
  // `useTour()` mount in the SAME tab (e.g. the header's replay button next
  // to the page that's actually showing the tip) never hears it. One custom
  // event, dispatched after every mutation, closes that gap with no new
  // dependency and no context.
  try {
    window.dispatchEvent(new Event(TOUR_SYNC_EVENT));
  } catch {
    /* non-browser environment (SSR/tests) — nothing to sync there */
  }
}

/**
 * R5-TUTORIAL — the tour's state, on localStorage `mk-tips-v1`. Same shape as
 * `use-cart.ts`: hydrates after mount (no SSR/client mismatch), listens to
 * `storage` so another tab that turned tips off stays in sync here too, and
 * (round 2) to `mk-tour-sync` for another mount in the SAME tab.
 */
export function useTour() {
  const [state, setState] = useState<TourState>(TOUR_DEFAULT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(load());
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === TOUR_KEY) setState(load());
    };
    const onSync = () => setState(load());
    window.addEventListener("storage", onStorage);
    window.addEventListener(TOUR_SYNC_EVENT, onSync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TOUR_SYNC_EVENT, onSync);
    };
  }, []);

  const runNext = useCallback((sequence: TourSequence) => {
    setState((s) => {
      const n = next(s, sequence);
      persist(n);
      return n;
    });
  }, []);

  const runTurnOff = useCallback(() => {
    setState((s) => {
      const n = turnOff(s);
      persist(n);
      return n;
    });
  }, []);

  const runStart = useCallback((sequence: TourSequence) => {
    setState(() => {
      const n = start(sequence);
      persist(n);
      return n;
    });
  }, []);

  return { state, hydrated, next: runNext, turnOff: runTurnOff, start: runStart };
}
