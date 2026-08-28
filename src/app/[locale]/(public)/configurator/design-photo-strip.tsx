"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { assetUrl } from "@/lib/storage";
import { hasPhotos } from "@/lib/configurator/photos";
import { useLaneFades } from "@/lib/configurator/use-lane-fades";
import { PhotoLightbox } from "@/components/ui-domain/photo-lightbox";
import { cn } from "@/lib/utils";

/**
 * F36 step-2: real-photo filmstrip. Fixed height / natural width (no crop),
 * horizontal snap scroll, edge fades, ‹ › arrows.
 * F41: each photo is a button that opens the full-screen lightbox below.
 *
 * R4-RESTYLE: the strip is now the «Inspirasjonsbilder» carousel of the mobile
 * step 2 too, so the arrows are no longer desktop-only — and both they and the
 * fades follow the SAME can-scroll state as the option lanes (`useLaneFades`,
 * mockup `can-l`/`can-r`): lit only while there is road left in that direction.
 *
 * ponytail: native overflow-x-auto + scrollBy covers snap/fades/arrows —
 * no carousel/embla needed for this, in the strip OR in the lightbox.
 */
export function DesignPhotoStrip({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  // TODO:nb-review NO copy: photosLabel / previousPhoto / nextPhoto / closePhoto
  const t = useTranslations("configurator.photos");
  const stripRef = useRef<HTMLDivElement>(null);
  const fades = useLaneFades(stripRef, images.length);
  const scroll = (dir: -1 | 1) => {
    const el = stripRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  // F41: which photo the lightbox shows (null = closed). `openedAt` survives
  // the close (state is already null by then) so focus can go back to the
  // thumb the user came FROM, not to wherever they swiped to (AC4).
  const [openAt, setOpenAt] = useState<number | null>(null);
  const openedAt = useRef(0);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const open = (i: number) => {
    openedAt.current = i;
    setOpenAt(i);
  };

  // AC: zero photos → render NOTHING (no container, no fades, no arrows).
  // Belt-and-suspenders with the parent guard, and resilient to a stale DTO.
  if (!hasPhotos(images)) return null;

  /** 36px disc + `after:-inset-1` = a 44px touch target (§5), visual unchanged. */
  const arrow =
    "absolute top-1/2 z-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background text-sm ring-1 ring-border transition-opacity after:absolute after:-inset-1 after:content-[''] outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div
      className="relative"
      role="group"
      aria-label={t("photosLabel")}
      data-testid="design-photo-strip"
    >
      <div
        ref={stripRef}
        // same gesture contract as the option lanes: the swipe here is
        // horizontal, and its end of travel must not scroll the page.
        className="flex touch-pan-x snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((img, i) => (
          // F41: the <img> is unchanged, it just gained a button wrapper that
          // carries the flex/snap/ring classes — same box, same rendering.
          <button
            key={img}
            type="button"
            ref={(el) => {
              thumbRefs.current[i] = el;
            }}
            onClick={() => open(i)}
            data-testid="design-photo"
            className="flex-none snap-start cursor-zoom-in rounded-lg ring-1 ring-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assetUrl(img)}
              alt={`${alt} ${i + 1}`}
              loading="lazy"
              className="block h-[120px] w-auto rounded-lg object-cover md:h-[190px]"
            />
          </button>
        ))}
      </div>
      {/* edge fades — narrow + DS `background` token (matches the site's pink
          page bg, not white); just a hint of "more", never covering the photo */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-background to-transparent transition-opacity",
          fades.left ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-background to-transparent transition-opacity",
          fades.right ? "opacity-100" : "opacity-0"
        )}
      />
      {/* arrows: hidden (and untabbable) when there is nothing to scroll to */}
      <button
        type="button"
        onClick={() => scroll(-1)}
        aria-label={t("previousPhoto")}
        data-testid="design-photo-prev"
        hidden={!fades.left}
        className={cn(arrow, "left-0")}
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => scroll(1)}
        aria-label={t("nextPhoto")}
        data-testid="design-photo-next"
        hidden={!fades.right}
        className={cn(arrow, "right-0")}
      >
        ›
      </button>

      <Dialog open={openAt !== null} onOpenChange={(o) => !o && setOpenAt(null)}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            // preventScroll: closing must not move the strip (AC4). Tapping a
            // half-visible thumb DOES scroll it flush first — the browser's own
            // focus-into-view, behind the modal, and it leaves that photo in
            // view on the way back; snap points make it land clean either way.
            thumbRefs.current[openedAt.current]?.focus({ preventScroll: true });
          }}
          className="top-0 left-0 flex h-dvh max-w-none! translate-x-0 translate-y-0 gap-0 rounded-none bg-black/90 p-0 ring-0 sm:max-w-none!"
          data-testid="design-photo-lightbox"
        >
          <DialogTitle className="sr-only">{t("photosLabel")}</DialogTitle>
          <PhotoLightbox
            images={images}
            alt={alt}
            startAt={openAt ?? 0}
            onClose={() => setOpenAt(null)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
