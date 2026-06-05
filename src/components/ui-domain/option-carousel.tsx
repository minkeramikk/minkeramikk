"use client";

import useEmblaCarousel from "embla-carousel-react";

/**
 * Horizontal, touch-draggable track for configurator options (DESIGN-SYSTEM
 * §3.10). embla gives momentum scroll on mobile (AC6); on desktop it just
 * scrolls. Slides size to their content.
 */
export function OptionCarousel({ children }: { children: React.ReactNode }) {
  const [emblaRef] = useEmblaCarousel({
    dragFree: true,
    containScroll: "trimSnaps",
    align: "start",
  });

  return (
    <div ref={emblaRef} className="overflow-hidden">
      <div className="flex gap-2.5 py-1">{children}</div>
    </div>
  );
}
