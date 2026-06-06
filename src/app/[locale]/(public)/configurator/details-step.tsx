"use client";

import { useEffect, useMemo, useReducer } from "react";
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
import {
  configuratorReducer,
  type ConfiguratorState,
  type SyncCategory,
} from "@/lib/configurator/state";
import { getPreviewLayers, type SelectedCategory } from "@/lib/configurator/preview";
import type { DesignDetail } from "@/lib/catalog/design-options";

const PREVIEW_WIDTH = 800;

function buildState(
  detail: DesignDetail,
  supplierId: string,
  params: URLSearchParams
): ConfiguratorState {
  const selections: Record<string, string> = {};
  for (const cat of detail.categories) {
    const fromUrl = params.get(`opt_${cat.slug}`);
    const valid = cat.options.find((o) => o.id === fromUrl);
    if (valid) {
      selections[cat.slug] = valid.id;
    } else if (cat.options.length === 1) {
      selections[cat.slug] = cat.options[0].id; // AC5: single option auto-selected
    }
  }
  return {
    designSlug: detail.slug,
    supplierId,
    selections,
    colorLock: params.get("lock") === "1",
  };
}

export function DetailsStep({
  detail,
  supplierId,
}: {
  detail: DesignDetail;
  supplierId: string;
}) {
  const t = useTranslations("configurator");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [state, dispatch] = useReducer(configuratorReducer, undefined, () =>
    buildState(detail, supplierId, new URLSearchParams(searchParams.toString()))
  );

  // keep state aligned with the URL (refresh, back/forward — AC4)
  useEffect(() => {
    dispatch({
      type: "hydrate",
      state: buildState(detail, supplierId, new URLSearchParams(searchParams.toString())),
    });
  }, [searchParams, detail, supplierId]);

  // sync-category lookup for the reducer's color lock
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

  function writeUrl(next: ConfiguratorState) {
    const params = new URLSearchParams(searchParams.toString());
    for (const cat of detail.categories) {
      const sel = next.selections[cat.slug];
      if (sel) params.set(`opt_${cat.slug}`, sel);
      else params.delete(`opt_${cat.slug}`);
    }
    if (next.colorLock) params.set("lock", "1");
    else params.delete("lock");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function selectOption(categorySlug: string, optionId: string) {
    const next = configuratorReducer(state, {
      type: "selectOption",
      categorySlug,
      optionId,
      categories: syncCategories,
    });
    dispatch({ type: "hydrate", state: next });
    writeUrl(next);
  }

  function toggleLock(locked: boolean) {
    const next = configuratorReducer(state, { type: "setColorLock", locked });
    dispatch({ type: "hydrate", state: next });
    writeUrl(next);
  }

  // resolve selected option per category → preview layers
  const previewLayers = useMemo(() => {
    const selected: SelectedCategory[] = detail.categories.map((c) => {
      const optId = state.selections[c.slug];
      const opt = c.options.find((o) => o.id === optId);
      return { layerSlot: c.layerSlot, layerImage: opt?.layerImage ?? null };
    });
    return getPreviewLayers(null, selected).map((l) => ({
      src: assetUrl(l.src, { width: PREVIEW_WIDTH }),
      recolor: l.blend === "multiply",
    }));
  }, [detail, state.selections]);

  function label(c: DesignDetail["categories"][number]) {
    return (locale === "no" ? c.labelNo : c.labelEn) ?? c.slug;
  }

  return (
    <div data-testid="details-step" data-color-lock={state.colorLock ? "1" : "0"}>
      <Stepper
        ariaLabel={t("stepperLabel")}
        current={1}
        steps={[
          { label: t("steps.design") },
          { label: t("steps.details") },
          { label: t("steps.ceramics") },
        ]}
      />
      <div className="grid grid-cols-1 items-start gap-7 md:grid-cols-2">
        <PreviewCanvas
          alt={detail.name}
          caption={t("previewNote")}
          layers={
            previewLayers.length
              ? previewLayers
              : [{ src: assetUrl(`designs/${detail.slug}/preview.png`, { width: PREVIEW_WIDTH }) }]
          }
        />

        <div className="flex min-w-0 flex-col gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              {t("stepIndicator", { step: 2 })}
            </p>
            <h2 className="mt-1 text-xl font-semibold">{detail.name}</h2>
          </div>

          {hasSyncGroup && (
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={state.colorLock}
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
            const selected = state.selections[cat.slug];
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
                  <div role="radiogroup" aria-label={label(cat)}>
                    <OptionCarousel>
                      {cat.options.map((o) => (
                        <div key={o.id} className="shrink-0">
                          <Swatch
                            hex={o.hex ?? "#000"}
                            name={o.name}
                            selected={selected === o.id}
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
                          imageUrl={
                            o.image
                              ? assetUrl(o.image, { width: 160 })
                              : undefined
                          }
                          selected={selected === o.id}
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
              onClick={() =>
                router.push(`${pathname}?design=${detail.slug}`, {
                  scroll: false,
                })
              }
            >
              {t("back")}
            </Button>
            <Button
              size="lg"
              className="flex-1"
              data-testid="next-step"
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("step", "3");
                router.push(`${pathname}?${params.toString()}`, {
                  scroll: false,
                });
              }}
            >
              {t("nextStepCeramic")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
