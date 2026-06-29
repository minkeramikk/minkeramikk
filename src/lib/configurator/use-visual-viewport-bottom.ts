"use client";

import { useEffect, useState } from "react";
import { visualViewportInset } from "./visual-viewport";

/**
 * R3-B — live keyboard inset (CSS px) for anchoring a fixed bottom element to
 * the visual viewport. Returns 0 on SSR and where window.visualViewport is
 * unsupported (→ current behaviour, the documented fallback). Listens to the
 * visualViewport resize/scroll the keyboard and pinch-zoom emit.
 */
export function useVisualViewportBottom(): number {
  const [bottom, setBottom] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () =>
      setBottom(
        visualViewportInset({
          innerHeight: window.innerHeight,
          viewportHeight: vv.height,
          offsetTop: vv.offsetTop,
        })
      );

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return bottom;
}
