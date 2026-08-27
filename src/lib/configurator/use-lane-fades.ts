"use client";

import { useEffect, useState, type RefObject } from "react";
import { laneFades, type LaneFades } from "./lane-fades";

/**
 * R4-STEP2 — stato delle sfumature di una corsia orizzontale. Ricalcola sullo
 * scroll (passivo), al resize e ogni volta che cambia `deps` (es. la tab
 * attiva: contenuto nuovo → corsa nuova). `ResizeObserver` copre anche il
 * caso in cui il contenuto arriva dopo il primo paint (immagini).
 *
 * ponytail: nessuna libreria, nessun rAF loop — tre listener e una funzione pura.
 */
export function useLaneFades(
  ref: RefObject<HTMLElement | null>,
  deps?: unknown
): LaneFades {
  const [fades, setFades] = useState<LaneFades>({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setFades(
        laneFades({
          scrollLeft: el.scrollLeft,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        })
      );
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [ref, deps]);

  return fades;
}
