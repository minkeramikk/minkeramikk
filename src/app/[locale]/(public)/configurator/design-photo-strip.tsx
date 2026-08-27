"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { assetUrl } from "@/lib/storage";
import { hasPhotos } from "@/lib/configurator/photos";
import { PhotoLightbox } from "@/components/ui-domain/photo-lightbox";

/**
 * F36 step-2: real-photo filmstrip. Fixed height / natural width (no crop),
 * horizontal snap scroll, edge fades, desktop-only ‹ › arrows.
 * F41: each photo is a button that opens the full-screen lightbox below.
 *
 * ponytail: native overflow-x-auto + scrollBy covers snap/fades/arrows —
 * no carousel/embla needed for this, in the strip OR in the lightbox.
 */
export function DesignPhotoStrip({
  images,
  alt,
  compact = false,
}: {
  images: string[];
  alt: string;
  /** R4-FIX 11: variante del tab «Bilder» nell'editor mobile — miniature
   *  ~104×78 al posto della striscia a piena altezza, che nel pannello non ci
   *  starebbe. Stessi asset, stesso lightbox. */
  compact?: boolean;
}) {
  // TODO:nb-review NO copy: photosLabel / previousPhoto / nextPhoto / closePhoto
  const t = useTranslations("configurator.photos");
  const stripRef = useRef<HTMLDivElement>(null);
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

  return (
    <div
      className="relative"
      role="group"
      aria-label={t("photosLabel")}
      data-testid="design-photo-strip"
    >
      <div
        ref={stripRef}
        className="flex gap-2.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory"
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
            className="flex-none snap-start cursor-zoom-in rounded-lg ring-1 ring-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assetUrl(img)}
              alt={`${alt} ${i + 1}`}
              loading="lazy"
              className={
                compact
                  ? "block h-[78px] w-[104px] rounded-lg object-cover"
                  : "block h-[120px] w-auto rounded-lg md:h-[190px]"
              }
            />
          </button>
        ))}
      </div>
      {/* edge fades — narrow + DS `background` token (matches the site's pink
          page bg, not white); just a hint of "more", never covering the photo */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-background to-transparent" />
      {/* arrows: desktop only */}
      <button
        type="button"
        onClick={() => scroll(-1)}
        aria-label={t("previousPhoto")}
        className="absolute left-0 top-1/2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background ring-1 ring-border md:flex"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => scroll(1)}
        aria-label={t("nextPhoto")}
        className="absolute right-0 top-1/2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-background ring-1 ring-border md:flex"
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
