"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { OptionCard } from "@/components/ui-domain/option-card";
import { OptionCarousel } from "@/components/ui-domain/option-carousel";
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
    <div data-testid="configurator">
      <Stepper
        ariaLabel={t("stepperLabel")}
        current={step - 1}
        steps={[
          { label: t("steps.design") },
          { label: t("steps.details") },
          { label: t("steps.ceramics") },
        ]}
      />

      <div className="grid grid-cols-1 items-start gap-7 md:grid-cols-2">
        {/* LEFT: the persistent preview — never remounts across steps (AC2) */}
        <PreviewCanvas
          alt={selected.name}
          caption={t("previewNote")}
          layers={previewLayers}
        />

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
            <div className="mt-auto">
              <Button
                className="w-full"
                size="lg"
                data-testid="next-step"
                onClick={() => goToStep(2)}
              >
                {t("nextStepDetails")}
              </Button>
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
                    <div
                      role="radiogroup"
                      aria-label={label(cat)}
                      onKeyDown={(e) => onRadioKeyDown(e, cat)}
                    >
                      <OptionCarousel>
                        {cat.options.map((o) => (
                          <div key={o.id} className="shrink-0">
                            <Swatch
                              hex={o.hex ?? "#000"}
                              name={o.name}
                              selected={sel === o.id}
                              tabIndex={sel === o.id ? 0 : -1}
                              previewSrc={
                                o.layerImage ? assetUrl(o.layerImage) : undefined
                              }
                              previewAlt={o.name}
                              onSelect={() => selectOption(cat.slug, o.id)}
                            />
                          </div>
                        ))}
                      </OptionCarousel>
                    </div>
                  ) : (
                    <OptionCarousel>
                      {cat.options.map((o) => (
                        <div key={o.id} className="w-24 shrink-0">
                          <OptionCard
                            label={o.name}
                            imageUrl={o.image ? assetUrl(o.image) : undefined}
                            selected={sel === o.id}
                            onSelect={() => selectOption(cat.slug, o.id)}
                          />
                        </div>
                      ))}
                    </OptionCarousel>
                  )}
                </fieldset>
              );
            })}

            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                data-testid="back-step"
                onClick={() => goToStep(1)}
              >
                {t("back")}
              </Button>
              <Button
                size="lg"
                className="flex-1"
                data-testid="next-step"
                onClick={() => goToStep(3)}
              >
                {t("nextStepCeramic")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
