"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CLOSE_DISC } from "@/components/ui-domain/close-disc";
import { DesignRound } from "@/components/ui-domain/design-round";
import { SetBadge } from "@/components/ui-domain/set-badge";
import { atVariantWidth, VARIANT_WIDTHS } from "@/lib/asset-variants";
import type { CartLayer, CartLine } from "@/lib/cart/cart";
import { cn } from "@/lib/utils";

export type LineLightboxSlide = "ceramic" | "palette";

/**
 * R5-BASKET-HOST task 3 — which of the two slides a line actually has.
 * «The ceramic» needs `plateImage`; «With your palette» needs at least one
 * layer (an unpainted line has none — `unpaint()` clears them to `undefined`,
 * and neither does a line saved before F19). Never a slide with nothing to
 * show it (mockup-lightbox.md). R5-POLISH-STEP23: there is no switcher any
 * more — the basket uses this to decide whether the thumb opens anything at
 * all, and the dialog to pick WHICH single view it opens on (the photo when
 * there is one, the composite when there is not).
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
  const tSelection = useTranslations("configurator.yourSelection");
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
        // Same scrim as the buy sheet — one modal language on this step.
        overlayClassName="bg-foreground/70 supports-backdrop-filter:backdrop-blur-none"
        className={cn(
          // R5-POLISH-STEP23 T3 round 2 (TL, 22/9: «la stessa modale con lo
          // stesso stile di quando apriamo per comprare»): this IS the
          // `ProductSheet` shell — bottom sheet on a phone, centred dialog
          // from `sm`, light surface — instead of the old full-screen ink
          // sheet. Narrower than the sheet (560 vs 860) because there is one
          // column here, not two: a ~520px square is what the plate needs.
          "top-auto bottom-0 left-1/2 w-full max-w-none! -translate-x-1/2 translate-y-0",
          "max-h-[88dvh] overflow-y-auto rounded-t-lg rounded-b-none",
          "px-4 pt-[26px] pb-[calc(14px+env(safe-area-inset-bottom))]",
          "shadow-[0_12px_40px_color-mix(in_oklab,var(--foreground)_28%,transparent)]",
          "sm:top-1/2 sm:bottom-auto sm:max-h-[90vh] sm:w-[min(560px,96vw)] sm:max-w-none!",
          "sm:-translate-y-1/2 sm:rounded-lg sm:p-5"
        )}
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          // Reuse — brief instruction: `configurator.photos.closePhoto`
          // already says exactly this, no synonym needed.
          aria-label={tPhotos("closePhoto")}
          data-testid="line-lightbox-close"
          className={cn("absolute top-2.5 right-3 z-2", CLOSE_DISC)}
        >
          ✕
        </button>

        {/* The dialog's accessible name IS the product name, same as the
            buy sheet — no `sr-only` twin for the screen reader to read twice. */}
        <DialogTitle className="pr-12 text-lg leading-snug font-semibold">{title}</DialogTitle>
        {(sizeLabel || isSet) && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-foreground">
            {sizeLabel}
            <SetBadge count={shown.pieces ?? 1} />
          </p>
        )}

        {/* The frame of the buy sheet's own photo (`product-sheet.tsx:202`):
            square, `--muted`, hairline border. `object-contain`, not `cover`:
            here the whole plate is the point. */}
        <div className="relative mt-3 grid aspect-square place-items-center overflow-hidden rounded-sm border border-border bg-muted p-4">
          {active === "ceramic" && shown.plateImage && (
            // eslint-disable-next-line @next/next/no-img-element -- chosen ceramic photo from storage
            <img
              // TL, 22/9: «almeno 512». The cart baked this URL at the 48px
              // thumb width; the class width (1024) is the one the buy sheet
              // and this dialog display, and it is pre-generated.
              src={atVariantWidth(shown.plateImage, VARIANT_WIDTHS.products)}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          )}
          {active === "palette" && shown.layers && shown.layers.length > 0 && (
            <div className="relative aspect-square size-full">
              <CompositeStack layers={shown.layers} />
            </div>
          )}
        </div>

        {/* R5-POLISH-STEP23 T3 round 2: the two-tile slide switcher is gone
            (TL: «with your palette → via»). When the line has both a photo
            and a design, the design shows the way the buy sheet shows it —
            the `.pair` strip of `product-sheet.tsx:233`, same markup, same
            copy key — so nothing is lost and there is one idiom, not two.
            A line with only layers still opens on the composite above: that
            is the `slides` fallback, not a second view to toggle. */}
        {shown.plateImage && shown.layers && shown.layers.length > 0 && (
          <div
            data-testid="line-lightbox-pair"
            className="mt-2.5 flex items-center gap-2.5 rounded-sm bg-muted px-3 py-2.5 text-[12.5px]"
          >
            <div className="flex shrink-0 items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- chosen ceramic photo from storage */}
              <img
                src={shown.plateImage}
                alt=""
                aria-hidden
                className="size-11 shrink-0 rounded-full object-cover"
              />
              <span aria-hidden className="font-semibold text-muted-foreground">
                +
              </span>
              <DesignRound layers={shown.layers} className="size-11" />
            </div>
            <p className="min-w-0 font-medium text-foreground">
              {tSelection("pairCaption")}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
