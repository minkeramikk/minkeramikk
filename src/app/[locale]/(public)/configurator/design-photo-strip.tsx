"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { assetUrl } from "@/lib/storage";
import { hasPhotos } from "./design-photos";

/**
 * F36 step-2: real-photo filmstrip. Fixed height / natural width (no crop),
 * horizontal snap scroll, edge fades, desktop-only ‹ › arrows.
 *
 * ponytail: native overflow-x-auto + scrollBy covers snap/fades/arrows —
 * no carousel/embla needed for this.
 */
export function DesignPhotoStrip({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  // TODO:nb-review NO copy: photosLabel / previousPhoto / nextPhoto
  const t = useTranslations("configurator.step2");
  const stripRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) => {
    const el = stripRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
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
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={img}
            src={assetUrl(img)}
            alt={`${alt} ${i + 1}`}
            loading="lazy"
            className="h-[120px] w-auto flex-none snap-start rounded-lg ring-1 ring-border md:h-[190px]"
          />
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
    </div>
  );
}
