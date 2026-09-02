"use client";

import { useEffect, useState, type RefObject } from "react";
import { laneFades, type LaneFades } from "./lane-fades";

/**
 * R4-STEP2 — stato delle sfumature di una corsia orizzontale. Ricalcola sullo
 * scroll (passivo), al resize e ogni volta che cambia `deps` (es. la tab
 * attiva: contenuto nuovo → corsa nuova).
 *
 * Il `ResizeObserver` osserva la corsia **e i suoi figli**. Osservare solo la
 * corsia non basta e non era un dettaglio: il CONTENITORE non cambia larghezza
 * quando cresce il CONTENUTO. Con `font-display: swap` i chip nascono con il
 * font di ripiego e si allargano quando arriva Poppins — `scrollWidth` sale,
 * la corsia trabocca, e nessun evento parte: le frecce restavano `hidden`
 * finché l'utente non scorreva a mano (misurato a 390: traccia da 366 a 458px,
 * `category-tabs-next` ancora nascosta). Vale per ogni corsia — barra tab,
 * corsie opzioni, striscia foto — quindi la correzione sta qui e non in un
 * call-site.
 *
 * `document.fonts.ready` è la rete di sicurezza per il caso simmetrico: il
 * font che cambia le metriche senza cambiare la size box di nessun figlio.
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
    const update = () => {
      const next = laneFades({
        scrollLeft: el.scrollLeft,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      });
      setFades((prev) =>
        prev.left === next.left && prev.right === next.right ? prev : next
      );
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    // `border-box`, non il `content-box` di default: ciò che fa traboccare la
    // corsia è la larghezza di LAYOUT dei chip: padding e bordo compresi. Un
    // chip che cresce solo di padding lascia il content box dov'era e non
    // sveglierebbe l'osservatore.
    const ro = new ResizeObserver(update);
    const box: ResizeObserverOptions = { box: "border-box" };
    ro.observe(el, box);
    for (const child of el.children) ro.observe(child, box);

    let live = true;
    // `?.` — `document.fonts` non esiste ovunque (jsdom, browser vecchi) e qui
    // è un extra, non il meccanismo.
    document.fonts?.ready.then(() => {
      if (live) update();
    });

    return () => {
      live = false;
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [ref, deps]);

  return fades;
}
