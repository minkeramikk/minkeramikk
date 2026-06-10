"use client";

import { useEffect, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { OptionCard } from "@/components/ui-domain/option-card";
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
import { cn } from "@/lib/utils";
import { ConfigCodeBar } from "./config-code-bar";
import type { DesignDetail } from "@/lib/catalog/design-options";
import type { PreviewLayer } from "@/lib/configurator/preview";

const PREVIEW_WIDTH = 800;

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
}: {
  designs: DesignChoice[];
  detailsBySlug: Record<string, DesignDetail>;
}) {
  const t = useTranslations("configurator");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
    return getPreviewLayers(null, cats).map((l) => ({
      src: assetUrl(l.src, { width: PREVIEW_WIDTH }),
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
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
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

  return (
    <div data-testid="configurator" className="max-md:pb-24">
      {/* F21: nav cluster — stepper always visible; Back/Next flanking on desktop only */}
      <div className="mb-4 flex items-center gap-2" data-testid="step-nav">
        <Button
          variant="outline"
          size="lg"
          data-testid="back-step"
          className="max-md:hidden min-h-11 shrink-0"
          disabled={step === 1}
          onClick={() => step > 1 && goToStep((step - 1) as 1 | 2)}
          aria-label={t("back")}
        >
          ‹ {t("back")}
        </Button>
        <Stepper
          ariaLabel={t("stepperLabel")}
          current={step - 1}
          steps={[
            { label: t("steps.design") },
            { label: t("steps.details") },
            { label: t("steps.ceramics") },
          ]}
          onStepSelect={(i) => goToStep((i + 1) as 1 | 2 | 3)}
          className="mb-0 mt-0 flex-1"
        />
        <Button
          size="lg"
          data-testid="next-step"
          className="max-md:hidden min-h-11 shrink-0"
          onClick={() => goToStep((step + 1) as 1 | 2 | 3)}
          aria-label={step === 1 ? t("nextStepDetails") : t("nextStepCeramic")}
        >
          {step === 1 ? t("nextStepDetails") : t("nextStepCeramic")} ›
        </Button>
      </div>

      {/* F21: mobile-only sticky bottom nav bar (unchanged from F18) */}
      <div
        data-testid="step-nav-mobile"
        className={cn(
          "md:hidden fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t border-border bg-background p-3",
          "shadow-[0_-2px_12px_color-mix(in_oklab,var(--mk-dark)_10%,transparent)]"
        )}
      >
        {step > 1 && (
          <Button
            variant="outline"
            size="lg"
            data-testid="back-step-mobile"
            className="min-h-11"
            onClick={() => goToStep((step - 1) as 1 | 2)}
          >
            {t("back")}
          </Button>
        )}
        <Button
          size="lg"
          data-testid="next-step-mobile"
          className="min-h-11 flex-1"
          onClick={() => goToStep((step + 1) as 1 | 2 | 3)}
        >
          {step === 1 ? t("nextStepDetails") : t("nextStepCeramic")}
        </Button>
      </div>

      <div className="grid grid-cols-1 items-start gap-7 md:grid-cols-2">
        {/* LEFT: the persistent preview — never remounts across steps (AC2).
            F15: sticky so it stays visible while the option list scrolls; on
            mobile it pins to the top and collapses to a compact thumbnail. */}
        <div className="z-30 flex min-w-0 flex-col gap-3 md:sticky md:top-4 md:self-start">
          <div data-testid="preview-sticky" className="max-md:mx-auto max-md:w-full">
            <PreviewCanvas
              alt={selected.name}
              caption={t("previewNote")}
              layers={previewLayers}
            />
          </div>
          {/* F19: save/share this design — by the preview, present in every step
              (replaces the per-step ConfigCodeBar box in step 2/3). */}
          {currentCode && (
            <ConfigCodeBar
              code={currentCode}
              shareUrl={shareUrl}
              onApply={applyCode}
            />
          )}
        </div>

        {/* RIGHT: panel swaps with the step */}
        {step === 1 ? (
          <div
            className="flex min-w-0 flex-col"
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
              return (
                <fieldset
                  key={cat.id}
                  data-testid={`category-${cat.slug}`}
                  className="min-w-0"
                >
                  <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em]">
                    {label(cat)}
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
          </div>
        )}
      </div>
    </div>
  );
}
