"use client";

import { useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SetBadge } from "@/components/ui-domain/set-badge";

export interface FeaturedStripItem {
  id: string;
  kind: "design" | "set";
  payload: string;
  /** resolved URL of the PRE-composed thumb — ONE image per card (ADR 0016) */
  thumbUrl: string;
  labelNo: string | null;
  labelEn: string | null;
  designName: string;
  designNameEn: string;
  setCount: number | null;
}

/**
 * F28 — "Populære design" strip on the home (step 1). Cards are REAL links
 * (shareable, cmd-click, keyboard): design → ?code= (step 2, decode-once
 * F04), set → ?step=3&set= (CA-3 landing, zero new logic). Desktop: embla
 * with arrows; touch: native scroll + snap (embla deactivates itself under
 * md). Right tail fades with a strip mask (pattern R1-FB5).
 *
 * TODO:nb-review — the new configurator.featured.* Norwegian strings in
 * no.json are fresh translations.
 */
export function FeaturedStrip({ items }: { items: FeaturedStripItem[] }) {
  const t = useTranslations("configurator.featured");
  const tc = useTranslations("configurator");
  const locale = useLocale();
  const designName = (f: FeaturedStripItem) =>
    locale === "no" ? f.designName : f.designNameEn;
  const [viewportRef, embla] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
    breakpoints: { "(max-width: 767px)": { active: false } },
  });
  const prev = useCallback(() => embla?.scrollPrev(), [embla]);
  const next = useCallback(() => embla?.scrollNext(), [embla]);

  const label = (f: FeaturedStripItem) => {
    const custom = locale === "no" ? f.labelNo : f.labelEn;
    if (custom) return custom;
    return f.kind === "set" && f.setCount != null
      ? tc("setBadge", { count: f.setCount })
      : designName(f);
  };

  // design → step 2 with the config loaded (same ?code=&step=2 semantics as
  // the F19 cart "reopen"); set → the CA-3 landing on step 3
  const href = (f: FeaturedStripItem) =>
    f.kind === "design"
      ? `/configurator?code=${encodeURIComponent(f.payload)}&step=2`
      : `/configurator?step=3&set=${f.payload}`;

  return (
    <section
      aria-labelledby="featured-heading"
      data-testid="featured-strip"
      className="mb-6"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <h2
          id="featured-heading"
          className="text-[11px] font-semibold uppercase tracking-[0.08em]"
        >
          {t("title")}
        </h2>
        <span className="rounded-full border border-primary px-2 py-0.5 text-[10px] font-medium text-primary">
          {t("curated")}
        </span>
        {/* desktop arrows — touch scrolls natively (no arrows, F28) */}
        <span className="ml-auto flex gap-1.5 max-md:hidden">
          <button
            type="button"
            aria-label={t("prev")}
            onClick={prev}
            className="flex size-8 items-center justify-center rounded-full border border-border bg-card text-sm hover:border-ring"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={t("next")}
            onClick={next}
            className="flex size-8 items-center justify-center rounded-full border border-border bg-card text-sm hover:border-ring"
          >
            ›
          </button>
        </span>
      </div>

      <div
        ref={viewportRef}
        className="snap-x snap-mandatory overflow-x-auto md:snap-none md:overflow-hidden [mask-image:linear-gradient(to_right,black_88%,transparent)] [-webkit-mask-image:linear-gradient(to_right,black_88%,transparent)]"
      >
        <div className="flex gap-2.5 pb-1 pr-10">
          {items.map((f, i) => (
            <Link
              key={f.id}
              href={href(f)}
              data-testid={`featured-card-${f.kind}`}
              aria-label={`${label(f)} — ${designName(f)}`}
              className="relative w-28 shrink-0 snap-start rounded-lg border border-border bg-card p-2.5 text-center transition-colors hover:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-32"
            >
              {f.kind === "set" && f.setCount != null && (
                <SetBadge
                  count={f.setCount}
                  testId="featured-set-badge"
                  className="absolute right-1.5 top-1.5 z-10"
                />
              )}
              {/* eslint-disable-next-line @next/next/no-img-element -- pre-composed thumb from storage */}
              <img
                src={f.thumbUrl}
                alt=""
                loading={i < 3 ? "eager" : "lazy"}
                decoding="async"
                className="mx-auto size-20 rounded-full border border-border/60 object-cover sm:size-24"
              />
              <span className="mt-1.5 block truncate text-xs font-medium">
                {label(f)}
              </span>
              <span className="block truncate text-[10.5px] text-muted-foreground">
                {designName(f)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
