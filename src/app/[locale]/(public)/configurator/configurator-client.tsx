"use client";

import { useEffect, useMemo, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { OptionCard } from "@/components/ui-domain/option-card";
import { useWarmupPreviews } from "@/components/ui-domain/hover-preview";
import { FloatingPreview } from "./floating-preview";
import { PreviewCanvas } from "@/components/ui-domain/preview-canvas";
import { Stepper } from "@/components/ui-domain/stepper";
import { Swatch } from "@/components/ui-domain/swatch";
import { Button } from "@/components/ui/button";
import { assetUrl } from "@/lib/storage";
import { getPreviewLayers, type SelectedCategory } from "@/lib/configurator/preview";
import {
  configuratorReducer,
  initialConfiguratorState,
  type SyncCategory,
} from "@/lib/configurator/state";
import {
  ConfigCodeError,
  decodeConfigCode,
  encodeConfigCode,
  toCodecDesign,
  type CodecDesign,
} from "@/lib/configurator/config-code";
import { ConfigCodeBar } from "./config-code-bar";
import { cn } from "@/lib/utils";
import type { DesignDetail } from "@/lib/catalog/design-options";
import type { PreviewLayer } from "@/lib/configurator/preview";

export interface DesignChoice {
  id: string;
  slug: string;
  name: string;
  supplierId: string;
  supplierName: string | null;
  previewImage: string | null;
  defaultLayers: PreviewLayer[];
}

/** Resolve the selected option per category from URL params, defaulting to the first. */
function resolveSelections(
  detail: DesignDetail,
  params: URLSearchParams
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cat of detail.categories) {
    const fromUrl = params.get(`opt_${cat.slug}`);
    const valid = cat.options.find((o) => o.id === fromUrl);
    out[cat.slug] = valid?.id ?? cat.options[0]?.id ?? "";
  }
  return out;
}

/**
 * Unified configurator shell for steps 1 and 2 (F14). The PreviewCanvas is
 * mounted ONCE here and never remounts across the step change — only the right
 * panel swaps (design grid ↔ categories). The preview is the continuity element.
 * Step 3 (ceramics + cart) is a different layout, rendered by the server page.
 */
export function ConfiguratorClient({
  designs,
  detailsBySlug,
  teaserProducts = {},
  featuredSlot = null,
}: {
  designs: DesignChoice[];
  detailsBySlug: Record<string, DesignDetail>;
  /** CA-6: supplierId → up to 3 product image paths for the step-2 teaser. */
  teaserProducts?: Record<string, string[]>;
  /** F28: server-rendered featured strip — step 1 only, between stepper and grid. */
  featuredSlot?: React.ReactNode;
}) {
  const t = useTranslations("configurator");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /** F31: the big preview's container — observed by the mobile floating bubble */
  const previewRef = useRef<HTMLDivElement>(null);

  const step = searchParams.get("step") === "2" ? 2 : 1;
  const urlSlug = searchParams.get("design");
  const selected =
    designs.find((d) => d.slug === urlSlug) ?? designs[0]; // sort_order=1 default (AC1)
  const detail = detailsBySlug[selected.slug];
  const colorLock = searchParams.get("lock") === "1";

  const selections = useMemo(
    () => resolveSelections(detail, new URLSearchParams(searchParams.toString())),
    [detail, searchParams]
  );

  // compose preview layers from the current selections (defaults at first paint)
  const previewLayers = useMemo(() => {
    const cats: SelectedCategory[] = detail.categories.map((c) => {
      const opt = c.options.find((o) => o.id === selections[c.slug]);
      return { layerSlot: c.layerSlot, layerImage: opt?.layerImage ?? null };
    });
    // F26.1: no width override — assetUrl derives the class width (designs@512),
    // the SAME URL the server page preloads (browser cache hit, no double fetch)
    return getPreviewLayers(null, cats).map((l) => ({
      src: assetUrl(l.src),
      recolor: l.blend === "multiply",
    }));
  }, [detail, selections]);

  const syncCategories: SyncCategory[] = useMemo(
    () =>
      detail.categories.map((c) => {
        const optionHex: Record<string, string | null> = {};
        const hexToOption: Record<string, string> = {};
        for (const o of c.options) {
          optionHex[o.id] = o.hex;
          if (o.hex && !(o.hex in hexToOption)) hexToOption[o.hex] = o.id;
        }
        return { slug: c.slug, syncGroup: c.syncGroup, optionHex, hexToOption };
      }),
    [detail]
  );
  const hasSyncGroup = detail.categories.some((c) => c.syncGroup);

  // R1-FB2: warm the hover-popup images (colour options' layerImage) in idle,
  // desktop-only — first hover shows instantly. Same assetUrl the Swatch
  // popup uses, so the cache hit is guaranteed. Design switch → new URLs
  // warm up, already-warmed ones are skipped (module-level Set).
  const warmupUrls = useMemo(
    () =>
      detail.categories.flatMap((c) =>
        c.kind === "color"
          ? c.options.map((o) => (o.layerImage ? assetUrl(o.layerImage) : null))
          : []
      ),
    [detail]
  );
  useWarmupPreviews(warmupUrls);

  // ── CA-6: "what's next" teaser under the preview (informative only) ──
  // step 1 → swatches of the SELECTED design's first colour category;
  // step 2 → the supplier's ceramic thumbs (F26 @256 variants, lazy).
  const teaserSwatches = useMemo(() => {
    const colorCat = detail.categories.find((c) => c.kind === "color");
    return (colorCat?.options ?? []).slice(0, 7);
  }, [detail]);
  /** First swatches fully opaque, the rest ramp down — "there's more". */
  const TEASER_CRISP = 4;
  const teaserThumbs = teaserProducts[selected.supplierId] ?? [];
  const showTeaser =
    step === 1 ? teaserSwatches.length > 0 : teaserThumbs.length > 0;

  // ── F15 / QA#3: keep the live preview visible while the option list scrolls ──
  // Desktop: the preview column is sticky (CSS only, md:sticky). Mobile: it scrolls
  // normally with the content. The old mobile collapse-to-thumbnail (zero-height
  // sentinel + IntersectionObserver + width toggle) was removed: with threshold 0
  // and no hysteresis it flip-flopped at the boundary (mobile URL-bar resize churn)
  // → the preview "flipped" continuously. A tested mobile sticky preview can return
  // in the dedicated mobile QA pass.

  // ── config code (ADR 0011): encode current, decode on paste ──
  const codecDesigns = useMemo(
    () =>
      Object.values(detailsBySlug)
        .map((d) => toCodecDesign(d))
        .filter((d): d is CodecDesign => d !== null),
    [detailsBySlug]
  );
  const currentCode = useMemo(() => {
    const cd = toCodecDesign(detail);
    return cd ? encodeConfigCode(cd, selections) : "";
  }, [detail, selections]);
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}?${searchParams.toString()}`
      : "";

  function applyCode(raw: string): boolean {
    try {
      const { designSlug, selections: sel } = decodeConfigCode(raw, (code) =>
        codecDesigns.find((d) => d.code === code.toUpperCase()) ?? null
      );
      const params = new URLSearchParams(searchParams.toString());
      params.set("design", designSlug);
      for (const key of [...params.keys()])
        if (key.startsWith("opt_")) params.delete(key);
      for (const [catSlug, optId] of Object.entries(sel))
        params.set(`opt_${catSlug}`, optId);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
      return true;
    } catch (e) {
      if (e instanceof ConfigCodeError) return false;
      throw e;
    }
  }

  // F19: a ?code= deep-link (cart-row "reopen" or a shared link) is decoded once
  // on arrival into the canonical opt_* params, then dropped from the URL.
  useEffect(() => {
    const incoming = searchParams.get("code");
    if (!incoming) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("code");
    try {
      const { designSlug, selections: sel } = decodeConfigCode(
        incoming,
        (c) => codecDesigns.find((d) => d.code === c.toUpperCase()) ?? null
      );
      params.set("design", designSlug);
      for (const key of [...params.keys()])
        if (key.startsWith("opt_")) params.delete(key);
      for (const [catSlug, optId] of Object.entries(sel))
        params.set(`opt_${catSlug}`, optId);
    } catch {
      /* invalid code → just drop the param, never crash */
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, codecDesigns, pathname, router]);

  function selectDesign(d: DesignChoice) {
    if (d.slug === selected.slug) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("design", d.slug);
    // a new design resets option selections (different categories)
    for (const key of [...params.keys()]) {
      if (key.startsWith("opt_")) params.delete(key);
    }
    params.delete("lock");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function selectOption(categorySlug: string, optionId: string) {
    // run through the reducer so color-lock sync (ADR 0004) is applied
    const base = {
      ...initialConfiguratorState,
      designSlug: selected.slug,
      supplierId: selected.supplierId,
      selections,
      colorLock,
    };
    const next = configuratorReducer(base, {
      type: "selectOption",
      categorySlug,
      optionId,
      categories: syncCategories,
    });
    const params = new URLSearchParams(searchParams.toString());
    for (const cat of detail.categories) {
      const sel = next.selections[cat.slug];
      if (sel) params.set(`opt_${cat.slug}`, sel);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function toggleLock(locked: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (locked) params.set("lock", "1");
    else params.delete("lock");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function goToStep(target: 1 | 2 | 3) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("design", selected.slug);
    if (target === 1) params.delete("step");
    else params.set("step", String(target));
    // CA-6b: default scroll (top) on step change — the new step starts from
    // its beginning; option selects keep scroll:false (same view).
    router.push(`${pathname}?${params.toString()}`);
  }

  function label(c: DesignDetail["categories"][number]) {
    return (locale === "no" ? c.labelNo : c.labelEn) ?? c.slug;
  }

  // ARIA radiogroup keyboard pattern (AC6): arrows move focus AND select,
  // Home/End jump to ends; selection follows focus.
  function onRadioKeyDown(
    e: React.KeyboardEvent<HTMLDivElement>,
    cat: DesignDetail["categories"][number]
  ) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const radios = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')
    );
    if (radios.length === 0) return;
    const curr = radios.indexOf(document.activeElement as HTMLElement);
    let next = curr < 0 ? 0 : curr;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      next = (curr + 1) % radios.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (curr - 1 + radios.length) % radios.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = radios.length - 1;
    radios[next]?.focus();
    const optId = cat.options[next]?.id;
    if (optId) selectOption(cat.slug, optId);
  }

  // CA-6 / CA-6b: informative teaser of the NEXT step — not clickable (no
  // role, no handler; decision 2026-06-12). Rendered twice: desktop under the
  // sticky preview (F15), mobile at the END of the options column (CA-6b) so
  // it never lengthens the scroll to the options (the CA-2 pain point).
  // Images: existing F26 variants only, lazy.
  function renderTeaser(className: string) {
    return (
      <div
        data-testid="next-step-teaser"
        data-design={selected.slug}
        className={`${className} flex items-center gap-4 rounded-sm border border-border bg-card/55 p-4`}
      >
        {step === 1 ? (
          // our REAL swatch assets (F26 @96). R1-FB5 (round 2, Daniele): the
          // annoyance was the white border ring itself (and the crescents it
          // cut where circles overlap) — gone entirely. The "there's more"
          // tail stays the original opacity ramp, WITHOUT blur (the blur was
          // what smeared the ring into halos; plain opacity reads clean).
          <div className="flex shrink-0" aria-hidden>
            {teaserSwatches.map((o, i) => {
              const fade =
                i >= TEASER_CRISP
                  ? { opacity: Math.max(0.3, 0.75 - (i - TEASER_CRISP) * 0.2) }
                  : undefined;
              return o.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- catalog art from storage
                <img
                  key={o.id}
                  src={assetUrl(o.image)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="-ml-2.5 size-8 rounded-full object-cover first:ml-0"
                  style={fade}
                />
              ) : o.hex ? (
                <span
                  key={o.id}
                  className="-ml-2.5 size-8 rounded-full first:ml-0"
                  style={{ background: o.hex, ...fade }}
                />
              ) : null;
            })}
          </div>
        ) : (
          <div className="flex shrink-0 gap-2.5" aria-hidden>
            {teaserThumbs.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element -- catalog art from storage
              <img
                key={img}
                src={assetUrl(img)}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-12 rounded-sm border border-border bg-card object-contain"
              />
            ))}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            {t("teaser.nextStep")}
          </p>
          <p className="truncate text-sm font-medium">
            {step === 1 ? t("teaser.colors") : t("teaser.ceramics")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="configurator">
      {/* CA-2: the top cluster holds ONLY the stepper (orientation + step
          jumps, F18). The advance/back CTAs moved in-flow to the END of the
          options column — no fixed bottom bar on mobile (thumb-tap issue),
          no climb back to the top on desktop. Decision closed with the
          client's written ok (mockup-ca2-next-button.html). */}
      <div className="mb-4" data-testid="step-nav">
        <Stepper
          ariaLabel={t("stepperLabel")}
          current={step - 1}
          steps={[
            { label: t("steps.design") },
            { label: t("steps.details") },
            { label: t("steps.ceramics") },
          ]}
          onStepSelect={(i) => goToStep((i + 1) as 1 | 2 | 3)}
          className="mb-0 mt-0"
        />
      </div>

      {/* F28: featured strip between stepper and grid (wireframe v2), home only */}
      {step === 1 && featuredSlot}

      <div className="grid grid-cols-1 items-start gap-7 md:grid-cols-2">
        {/* LEFT: the persistent preview — never remounts across steps (AC2).
            F15: sticky so it stays visible while the option list scrolls; on
            mobile it pins to the top.
            CA-7 (variant B): on mobile STEP 1 only, this column drops BELOW the
            design grid (max-md:order-last) and the hero shrinks to a compact
            "Valgt: {name}" confirmation — design-first browsing. Same
            PreviewCanvas instance, toggled purely via CSS (order + width), never
            remounted. Desktop and steps 2–3 are unchanged. */}
        <div
          className={cn(
            "z-30 flex min-w-0 flex-col gap-3 md:sticky md:top-4 md:self-start",
            step === 1 && "max-md:order-last"
          )}
        >
          <div
            ref={previewRef}
            data-testid="preview-sticky"
            className={cn(
              "max-md:mx-auto max-md:w-full",
              // CA-7: compact hero on mobile step 1 — cap the square at ~112px
              step === 1 && "max-md:max-w-[112px]"
            )}
          >
            <PreviewCanvas
              alt={selected.name}
              // step 1: caption rendered below (responsive — see next block);
              // steps 2–3: the live-preview note, unchanged.
              caption={step === 1 ? undefined : t("previewNote")}
              layers={previewLayers}
            />
          </div>
          {step === 1 && (
            <>
              {/* desktop step 1: the original live-preview note (unchanged) */}
              <p className="max-md:hidden text-center text-xs italic text-muted-foreground">
                {t("previewNote")}
              </p>
              {/* mobile step 1: compact confirmation of the chosen design */}
              <p
                data-testid="preview-confirm"
                className="truncate text-center text-xs text-muted-foreground md:hidden"
              >
                {t("step1.selected")}{" "}
                <span className="font-medium text-foreground">
                  {selected.name}
                </span>
              </p>
            </>
          )}
          {/* CA-6: informative teaser of the NEXT step — desktop instance,
              inside the sticky block so it follows the preview (F15). */}
          {showTeaser && renderTeaser("max-md:hidden")}
        </div>

        {/* RIGHT: panel swaps with the step */}
        {step === 1 ? (
          <div
            className="flex min-w-0 flex-col max-md:order-first"
            data-testid="design-step"
            data-supplier-id={selected.supplierId}
          >
            <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              {t("stepIndicator", { step: 1 })}
            </p>
            <h2 className="mb-4 mt-1 text-xl font-semibold">{t("step1.title")}</h2>
            <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {designs.map((d) => (
                <OptionCard
                  key={d.id}
                  label={d.name}
                  supplierName={d.supplierName ?? undefined}
                  selected={d.slug === selected.slug}
                  onSelect={() => selectDesign(d)}
                />
              ))}
            </div>
            {/* CA-6b: mobile teaser sits right BEFORE the CTA — "what's next"
                read before tapping Next (card decision 2026-06-12; also keeps
                the f18 invariant: nav block closed only by the code bar).
                mb-6 = the step-2 column's gap-6, so the teaser→CTA breathing
                room matches across steps (this column has no flex gap). */}
            {showTeaser && renderTeaser("md:hidden mt-3 mb-6")}
            {/* CA-2: advance CTA closes the options column — natural end of
                the flow, single instance for every viewport. No Back here:
                step 1 is the first step. */}
            <div data-testid="step-nav-flow">
              <Button
                size="lg"
                data-testid="next-step"
                className="min-h-11 w-full"
                onClick={() => goToStep(2)}
              >
                {t("nextStepDetails")} ›
              </Button>
            </div>
            {/* F19 save/share — moved from under the preview to the action
                column, below the CTA (CA-6 follow-up, 2026-06-12) */}
            {currentCode && (
              <div className="mt-3">
                <ConfigCodeBar
                  code={currentCode}
                  shareUrl={shareUrl}
                  onApply={applyCode}
                />
              </div>
            )}
          </div>
        ) : (
          <div
            className="flex min-w-0 flex-col gap-6"
            data-testid="details-step"
            data-color-lock={colorLock ? "1" : "0"}
          >
            <div>
              <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                {t("stepIndicator", { step: 2 })}
              </p>
              <h2 className="mt-1 text-xl font-semibold">{selected.name}</h2>
            </div>

            {hasSyncGroup && (
              <label className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={colorLock}
                  onChange={(e) => toggleLock(e.target.checked)}
                  className="size-4 accent-[var(--mk-accent)]"
                  data-testid="color-lock"
                />
                <span>
                  <span className="font-medium">{t("lockColors")}</span>
                  <span className="ml-2 text-muted-foreground">
                    {t("lockColorsHint")}
                  </span>
                </span>
              </label>
            )}

            {detail.categories.map((cat) => {
              const sel = selections[cat.slug];
              const single = cat.options.length === 1;
              // R1-FB1: the selected COLOUR's name doubles the swatch as text
              // (manager+ceramist double check). Catalog proper noun, no i18n.
              // Derived from `selections` (URL params), so click, keyboard,
              // ?code= reloads and sync_group (color-lock) all update it.
              const selectedName =
                cat.kind === "color"
                  ? cat.options.find((o) => o.id === sel)?.name
                  : undefined;
              return (
                <fieldset
                  key={cat.id}
                  data-testid={`category-${cat.slug}`}
                  className="min-w-0"
                >
                  <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em]">
                    {label(cat)}
                    {selectedName && (
                      <span
                        data-testid="legend-selected"
                        className="ml-1.5 font-medium normal-case tracking-normal text-muted-foreground"
                      >
                        <span className="sr-only">{t("selectedLabel")} </span>
                        · {selectedName}
                      </span>
                    )}
                    {single && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        {t("singleOption")}
                      </span>
                    )}
                  </legend>

                  {single ? null : cat.kind === "color" ? (
                    // F15: full vertical grid that wraps — every option visible,
                    // no horizontal scroller (supersedes the F02 embla carousel).
                    <div
                      role="radiogroup"
                      aria-label={label(cat)}
                      onKeyDown={(e) => onRadioKeyDown(e, cat)}
                      data-testid="option-grid"
                      className="flex flex-wrap gap-2.5"
                    >
                      {cat.options.map((o) => (
                        <Swatch
                          key={o.id}
                          hex={o.hex ?? "#000"}
                          name={o.name}
                          selected={sel === o.id}
                          tabIndex={sel === o.id ? 0 : -1}
                          imageSrc={o.image ? assetUrl(o.image) : undefined}
                          previewSrc={
                            o.layerImage ? assetUrl(o.layerImage) : undefined
                          }
                          previewAlt={o.name}
                          onSelect={() => selectOption(cat.slug, o.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      data-testid="option-grid"
                      className="grid grid-cols-3 gap-2.5 sm:grid-cols-4"
                    >
                      {cat.options.map((o) => (
                        <OptionCard
                          key={o.id}
                          label={o.name}
                          imageUrl={o.image ? assetUrl(o.image) : undefined}
                          selected={sel === o.id}
                          onSelect={() => selectOption(cat.slug, o.id)}
                        />
                      ))}
                    </div>
                  )}
                </fieldset>
              );
            })}

            {/* CA-6b: mobile teaser right BEFORE the CTA (see step 1) */}
            {showTeaser && renderTeaser("md:hidden")}
            {/* CA-2: Back + advance close the options column (last in DOM →
                natural tab order: options → CTA). */}
            <div className="flex gap-3" data-testid="step-nav-flow">
              <Button
                variant="outline"
                size="lg"
                data-testid="back-step"
                className="min-h-11 shrink-0"
                onClick={() => goToStep(1)}
              >
                ‹ {t("back")}
              </Button>
              <Button
                size="lg"
                data-testid="next-step"
                className="min-h-11 flex-1"
                onClick={() => goToStep(3)}
              >
                {t("nextStepCeramic")} ›
              </Button>
            </div>
            {/* F19 save/share — action column, below the CTA (see step 1) */}
            {currentCode && (
              <ConfigCodeBar
                code={currentCode}
                shareUrl={shareUrl}
                onApply={applyCode}
              />
            )}
          </div>
        )}
      </div>

      {/* F31: mobile-only floating mini-plate, step 2 only (step 1 has the
          design grid previews, step 3 the cart panel). Fixed OVERLAY sibling
          of the layout — its visibility can never reflow the page. */}
      {step === 2 && (
        <FloatingPreview targetRef={previewRef} layers={previewLayers} />
      )}
    </div>
  );
}
