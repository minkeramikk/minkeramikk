"use client";

import { useEffect } from "react";
import { VARIANT_SUFFIX_RE } from "@/lib/asset-variants";

/** Rewrite a failed `…@N.webp` variant URL back to its `.png` master (all
 *  masters are uploaded as .png — see the upload actions' path convention). */
function fallbackToMaster(img: HTMLImageElement): void {
  if (img.dataset.variantFallback === "1") return; // never loop
  if (!VARIANT_SUFFIX_RE.test(img.src)) return;
  img.dataset.variantFallback = "1";
  img.src = img.src.replace(VARIANT_SUFFIX_RE, ".png");
}

/**
 * F26 rollout safety net, mounted once in the root layout: any <img> whose
 * `@<width>.webp` variant 404s (not yet backfilled) falls back to the master.
 * One capturing listener (error events don't bubble) covers every image in
 * the app — server- and client-rendered — without touching each call site.
 */
export function AssetVariantFallback() {
  useEffect(() => {
    const onError = (e: Event) => {
      if (e.target instanceof HTMLImageElement) fallbackToMaster(e.target);
    };
    document.addEventListener("error", onError, true);
    // images that already failed before hydration won't re-fire the event
    for (const img of document.querySelectorAll("img")) {
      if (img.complete && img.naturalWidth === 0) fallbackToMaster(img);
    }
    return () => document.removeEventListener("error", onError, true);
  }, []);
  return null;
}
