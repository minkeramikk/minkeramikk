"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { assetUrl } from "@/lib/storage";
import { photoIndexAt } from "@/lib/configurator/photos";

/**
 * F41 lightbox body. Mounts only while the Dialog is open (Radix unmounts the
 * portal), which is what makes AC3 free: no modal-sized photo is fetched
 * before the first click.
 *
 * Same snap-scroll technique as the strip: one full-width slide per photo,
 * arrows `scrollBy` a full width, touch swipe is the browser's. Radix gives
 * focus trap, Esc and scroll lock.
 */
export function PhotoLightbox({
  images,
  alt,
  startAt,
  onClose,
}: {
  images: string[];
  alt: string;
  startAt: number;
  onClose: () => void;
}) {
  const t = useTranslations("configurator.photos");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(startAt);
  const last = images.length - 1;

  // jump to the clicked photo before paint (no scroll-smooth on the scroller,
  // or this assignment would animate from photo 1).
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollLeft = startAt * el.clientWidth;
  }, [startAt]);

  const scroll = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div
      className="relative h-full w-full"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") scroll(-1);
        if (e.key === "ArrowRight") scroll(1);
      }}
    >
      <div
        ref={scrollerRef}
        onScroll={(e) =>
          setCurrent(
            photoIndexAt(
              e.currentTarget.scrollLeft,
              e.currentTarget.clientWidth,
              images.length
            )
          )
        }
        // backdrop click = anywhere that isn't the photo itself; the controls
        // sit outside this scroller, so they can't swallow it.
        onClick={(e) => {
          if ((e.target as HTMLElement).tagName !== "IMG") onClose();
        }}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((img, i) => (
          <div
            key={img}
            className="flex h-full w-full flex-none snap-center items-center justify-center p-4"
          >
            {/* AC3 lazy: only the current photo and its two neighbours exist in
                the DOM — stricter than loading="lazy", and the URL is the
                filmstrip's own variant, so it's a cache hit. */}
            {Math.abs(i - current) <= 1 && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={assetUrl(img, { width: 1024 })}
                alt={`${alt} ${i + 1}`}
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>
        ))}
      </div>

      {/* one photo → no arrows, no counter (AC7) */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => scroll(-1)}
            disabled={current === 0}
            aria-label={t("previousPhoto")}
            className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background text-lg ring-1 ring-border disabled:opacity-40"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            disabled={current === last}
            aria-label={t("nextPhoto")}
            className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background text-lg ring-1 ring-border disabled:opacity-40"
          >
            ›
          </button>
          <p
            aria-live="polite"
            data-testid="design-photo-counter"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-background px-3 py-1 text-sm ring-1 ring-border"
          >
            {t("photoCounter", { n: current + 1, total: images.length })}
          </p>
        </>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label={t("closePhoto")}
        className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-full bg-background text-lg ring-1 ring-border"
      >
        ✕
      </button>
    </div>
  );
}
