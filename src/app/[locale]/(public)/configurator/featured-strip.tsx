"use client";

import { useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money/money";

export interface FeaturedStripItem {
  id: string;
  kind: "design" | "set" | "kit";
  payload: string;
  /** resolved URL of the PRE-composed thumb — ONE image per card (ADR 0016) */
  thumbUrl: string;
  labelNo: string | null;
  labelEn: string | null;
  designName: string;
  designNameEn: string;
  setCount: number | null;
  /** R5-KIT: live price of the pieces (sets and kits); null for design */
  price: { grossCents: number; netCents: number; currency: "NOK" | "EUR" | "GBP" } | null;
  /** fix 7: custom uploads fill the card frame; composed thumbs stay round */
  customImage: boolean;
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
  // the F19 cart "reopen"); set → the CA-3 landing on step 3; kit → step 2
  // with the pieces (R5-KIT)
  const href = (f: FeaturedStripItem) =>
    f.kind === "design"
      ? `/configurator?code=${encodeURIComponent(f.payload)}&step=2`
      : f.kind === "kit"
        ? `/configurator?step=2&kit=${encodeURIComponent(f.payload)}`
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
          {items.map((f, i) => {
            const net =
              f.price && f.kind !== "design"
                ? formatMoney(
                    { amountCents: f.price.netCents, currency: f.price.currency },
                    locale as "no" | "en"
                  )
                : null;
            const gross =
              f.price && f.kind !== "design" && f.price.netCents < f.price.grossCents
                ? formatMoney(
                    { amountCents: f.price.grossCents, currency: f.price.currency },
                    locale as "no" | "en"
                  )
                : null;
            return (
              <Link
                key={f.id}
                href={href(f)}
                data-testid={`featured-card-${f.kind}`}
                data-kind={f.kind}
                aria-label={`${label(f)} — ${designName(f)}`}
                className="w-[188px] shrink-0 snap-start overflow-hidden rounded-[13px] border border-border bg-card transition-colors hover:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span
                  className={`relative grid h-[128px] place-items-center ${
                    f.customImage
                      ? ""
                      : "bg-[color-mix(in_oklab,var(--mk-light),white_40%)]"
                  }`}
                >
                  {(f.kind === "set" || f.kind === "kit") && f.setCount != null && (
                    <span
                      className={`absolute left-2 top-2 z-10 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em] ${
                        f.kind === "kit"
                          ? "bg-ink text-ink-foreground"
                          : "bg-card text-foreground ring-1 ring-border"
                      }`}
                    >
                      {f.kind === "kit"
                        ? t("kitBadge", { count: f.setCount })
                        : tc("setBadge", { count: f.setCount })}
                    </span>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element -- pre-composed thumb from storage */}
                  <img
                    src={f.thumbUrl}
                    alt=""
                    loading={i < 3 ? "eager" : "lazy"}
                    decoding="async"
                    className={
                      f.customImage
                        ? "absolute inset-0 size-full object-cover"
                        : "size-[86px] rounded-full object-cover"
                    }
                  />
                </span>
                <span className="block px-2.5 py-2.5">
                  <span className="block text-[13px] font-semibold leading-tight">
                    {label(f)}
                  </span>
                  <span
                    className={`block text-[11px] ${
                      f.kind === "kit"
                        ? "font-medium text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    {f.kind === "kit" ? (
                      t.rich("coloursYours", { b: (c) => <b key="b">{c}</b> })
                    ) : f.kind === "set" ? (
                      t("coloursReady")
                    ) : (
                      t("buildYourOwn")
                    )}
                  </span>
                  {net && (
                    <span className="mt-0.5 block text-[13px] font-semibold">
                      {net}
                      {gross && (
                        <span className="ml-1.5 text-[11px] font-normal text-muted-foreground line-through">
                          {gross}
                        </span>
                      )}
                    </span>
                  )}
                  {(f.kind === "set" || f.kind === "kit") && (
                    <span
                      className={`mt-2 block h-8 w-full rounded-full text-center text-[12px] font-semibold leading-8 ${
                        f.kind === "kit"
                          ? "bg-primary text-primary-foreground"
                          : "border border-primary/40 text-primary"
                      }`}
                    >
                      {f.kind === "kit" ? t("colourKit") : t("seeSet")}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
