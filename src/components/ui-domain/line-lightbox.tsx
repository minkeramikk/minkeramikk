"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CLOSE_DISC } from "@/components/ui-domain/close-disc";
import { SetBadge } from "@/components/ui-domain/set-badge";
import type { CartLayer, CartLine } from "@/lib/cart/cart";
import { cn } from "@/lib/utils";

export type LineLightboxSlide = "ceramic" | "palette";

/**
 * R5-BASKET-HOST task 3 — which of the two slides a line actually has.
 * «The ceramic» needs `plateImage`; «With your palette» needs at least one
 * layer (an unpainted line has none — `unpaint()` clears them to `undefined`,
 * and neither does a line saved before F19). Never a slide with nothing to
 * show it (mockup-lightbox.md) — a caller renders the switcher at all only
 * when this returns 2 entries.
 */
export function lineLightboxSlides(
  line: Pick<CartLine, "plateImage" | "layers">
): LineLightboxSlide[] {
  const slides: LineLightboxSlide[] = [];
  if (line.plateImage) slides.push("ceramic");
  if (line.layers && line.layers.length > 0) slides.push("palette");
  return slides;
}

function CompositeStack({ layers, className }: { layers: CartLayer[]; className?: string }) {
  return (
    <>
      {layers.map((l, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- composited catalog art from storage
        <img
          key={`${l.src}-${i}`}
          src={l.src}
          alt=""
          className={cn("absolute inset-0 size-full object-contain", className)}
          style={l.recolor ? { mixBlendMode: "multiply" } : undefined}
        />
      ))}
    </>
  );
}

/**
 * R5-BASKET-HOST task 3 — what the basket row's thumb (task 2, `onOpenPhoto`)
 * opens: the ceramic photo and the painted composite, full-bleed. Binding
 * source: `Lightbox()` in `.superpowers/sdd/2026-09-19-r5-basket-host/
 * mockup-lightbox.md`.
 *
 * Built on the Radix wrapper, same recipe as `ProductSheet`'s own F41
 * lightbox (`product-sheet.tsx:418-430`): `showCloseButton={false}`, a
 * full-viewport `DialogContent`, an `sr-only` `DialogTitle`, and the ✕ from
 * the shared `CLOSE_DISC` — NOT `PhotoLightbox` (F41): that one takes
 * `images: string[]`, one `<img>` per slide, and our second slide is a live
 * composite of layers, not a string.
 *
 * `line: CartLine | null` + `lastLine` ref, same pattern as `UnpaintDialog`:
 * the owner clears the id the instant the cart line disappears (paint,
 * unpaint, cross-tab sync), which would otherwise render an empty dialog for
 * Radix's ~100ms exit animation.
 *
 * Focus return: verified in the browser that Radix's bare default does NOT
 * restore it — the thumb is a plain `<button>`, not a `Dialog.Trigger`, and
 * without a `Trigger` Radix has nothing to return to (same reason
 * `UnpaintDialog` and `AddedSheet` each read `document.activeElement`
 * themselves rather than trusting the default). Same fix here: a `trigger`
 * ref captured on open, restored in `onCloseAutoFocus`.
 */
export function LineLightbox({
  line,
  locale,
  onOpenChange,
}: {
  /** The line whose thumb was tapped, or null while closed. */
  line: CartLine | null;
  locale: "no" | "en";
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("cart.lightbox");
  const tPhotos = useTranslations("configurator.photos");
  const open = line !== null;

  const lastLine = useRef<CartLine | null>(null);
  if (line) lastLine.current = line;
  const shown = line ?? lastLine.current;

  // Same a11y contract as `UnpaintDialog`/`AddedSheet`: the thumb is a plain
  // `<button>`, not a `Dialog.Trigger`, so Radix's own default has nothing to
  // restore focus to on close — read it ourselves.
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) trigger.current = document.activeElement as HTMLElement | null;
  }, [open]);

  const [active, setActive] = useState<LineLightboxSlide>("ceramic");
  useEffect(() => {
    if (line) setActive(lineLightboxSlides(line)[0] ?? "ceramic");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.id]);

  if (!shown) return null;

  const slides = lineLightboxSlides(shown);
  const title = locale === "no" ? shown.productNameNo : shown.productNameEn;
  const sizeLabel = locale === "no" ? shown.sizeLabelNo : shown.sizeLabelEn;
  const isSet = (shown.pieces ?? 1) > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        data-testid="line-lightbox"
        onCloseAutoFocus={(e) => {
          // Fix round 1 — cross-tab sync can prune `openPhotoId` (the line
          // painted/removed elsewhere) in the same render that unmounts the
          // row, so `trigger` can point at a detached node: `.focus()` on
          // that is a silent no-op and focus would land on `<body>`. Only
          // take over when the node is still actually in the document;
          // otherwise don't `preventDefault()` and let Radix fall back to
          // its own restore — same escape hatch `UnpaintDialog` keeps via
          // `onConfirmed` for its own "the trigger is gone" case.
          if (trigger.current?.isConnected) {
            e.preventDefault();
            trigger.current.focus();
          }
        }}
        className="top-0 left-0 flex h-dvh max-w-none! translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-ink/92 px-4 py-3 ring-0 sm:max-w-none!"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>

        <div className="flex items-center gap-2 text-ink-foreground">
          <b className="min-w-0 truncate text-[14px]">{title}</b>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            // Reuse — brief instruction: `configurator.photos.closePhoto`
            // already says exactly this, no synonym needed.
            aria-label={tPhotos("closePhoto")}
            data-testid="line-lightbox-close"
            className={cn("ml-auto", CLOSE_DISC)}
          >
            ✕
          </button>
        </div>

        <div className="my-3 grid min-h-0 flex-1 place-items-center overflow-hidden rounded-lg bg-[var(--mk-canvas)] p-4">
          {active === "ceramic" && shown.plateImage && (
            // eslint-disable-next-line @next/next/no-img-element -- chosen ceramic photo from storage
            <img src={shown.plateImage} alt="" className="max-h-full max-w-full object-contain" />
          )}
          {active === "palette" && shown.layers && shown.layers.length > 0 && (
            <div className="relative aspect-square max-h-full w-full max-w-[320px]">
              <CompositeStack layers={shown.layers} />
            </div>
          )}
        </div>

        {slides.length > 1 && (
          <div className="flex shrink-0 gap-2">
            {slides.map((slide) => (
              <button
                key={slide}
                type="button"
                data-testid={`line-lightbox-slide-${slide}`}
                onClick={() => setActive(slide)}
                aria-pressed={active === slide}
                className={cn(
                  "flex-1 rounded-md border-2 p-1",
                  active === slide ? "border-ink-foreground/80" : "border-ink-foreground/25"
                )}
              >
                <span className="relative block h-12 overflow-hidden rounded bg-muted">
                  {slide === "ceramic"
                    ? shown.plateImage && (
                        // eslint-disable-next-line @next/next/no-img-element -- chosen ceramic photo from storage
                        <img
                          src={shown.plateImage}
                          alt=""
                          className="absolute inset-[6%] size-[88%] object-contain"
                        />
                      )
                    : shown.layers && <CompositeStack layers={shown.layers} className="inset-[6%] size-[88%]" />}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-[10.5px]",
                    active === slide ? "text-ink-foreground" : "text-ink-foreground/70"
                  )}
                >
                  {/* TODO:nb-review — cart.lightbox.ceramic / .withPalette NO
                      copy is new, unreviewed. */}
                  {slide === "ceramic" ? t("ceramic") : t("withPalette")}
                </span>
              </button>
            ))}
          </div>
        )}

        {(sizeLabel || isSet) && (
          <p className="mt-2 flex shrink-0 items-center justify-center gap-1.5 text-center text-[11.5px] text-ink-foreground/70">
            {sizeLabel}
            <SetBadge count={shown.pieces ?? 1} />
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
