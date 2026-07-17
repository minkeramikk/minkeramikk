"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { assetUrl } from "@/lib/storage";

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

  return (
    <div className="relative" role="group" aria-label={t("photosLabel")}>
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
            className="h-[104px] w-auto flex-none snap-start rounded-lg ring-1 ring-border md:h-[150px]"
          />
        ))}
      </div>
      {/* edge fades — DS surface token, both sides */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent" />
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
