"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { OptionCard } from "@/components/ui-domain/option-card";
import { PreviewCanvas } from "@/components/ui-domain/preview-canvas";
import { Stepper } from "@/components/ui-domain/stepper";
import { Button } from "@/components/ui/button";
import {
  configuratorReducer,
  initialConfiguratorState,
} from "@/lib/configurator/state";
import { assetUrl } from "@/lib/storage";

export interface DesignChoice {
  id: string;
  slug: string;
  name: string;
  supplierId: string;
  supplierName: string | null;
  previewImage: string | null;
}

const PREVIEW_WIDTH = 800;

/**
 * Configurator step 1 (F01): design grid, URL-synced selection
 * (?design=slug — refresh and back/forward preserve it, AC2), preview
 * from Storage with a skeleton while loading.
 */
export function DesignStep({ designs }: { designs: DesignChoice[] }) {
  const t = useTranslations("configurator");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlSlug = searchParams.get("design");

  const [state, dispatch] = useReducer(
    configuratorReducer,
    initialConfiguratorState,
    (init) => {
      const fromUrl = designs.find((d) => d.slug === urlSlug);
      return fromUrl
        ? configuratorReducer(init, {
            type: "selectDesign",
            design: { slug: fromUrl.slug, supplierId: fromUrl.supplierId },
          })
        : init;
    }
  );

  // URL is the source of truth: realign on back/forward navigation (AC2)
  useEffect(() => {
    const fromUrl = designs.find((d) => d.slug === urlSlug);
    if (fromUrl && fromUrl.slug !== state.designSlug) {
      dispatch({
        type: "selectDesign",
        design: { slug: fromUrl.slug, supplierId: fromUrl.supplierId },
      });
    }
  }, [urlSlug, designs, state.designSlug]);

  const selected = useMemo(
    () => designs.find((d) => d.slug === state.designSlug) ?? null,
    [designs, state.designSlug]
  );

  const previewUrl = selected?.previewImage
    ? assetUrl(selected.previewImage, { width: PREVIEW_WIDTH })
    : null;

  // skeleton while the preview image loads (AC2)
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!previewUrl) return;
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) setLoadedUrl(previewUrl);
    };
    img.src = previewUrl;
    return () => {
      cancelled = true;
    };
  }, [previewUrl]);
  const previewLoading = previewUrl !== null && loadedUrl !== previewUrl;

  function select(design: DesignChoice) {
    if (design.slug === state.designSlug) return;
    dispatch({
      type: "selectDesign",
      design: { slug: design.slug, supplierId: design.supplierId },
    });
    const params = new URLSearchParams(searchParams.toString());
    params.set("design", design.slug);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div data-testid="design-step" data-supplier-id={state.supplierId ?? ""}>
      <Stepper
        ariaLabel={t("stepperLabel")}
        current={0}
        steps={[
          { label: t("steps.design") },
          { label: t("steps.details") },
          { label: t("steps.ceramics") },
        ]}
      />
      <div className="grid grid-cols-1 items-stretch gap-7 md:grid-cols-2">
        <div>
          {previewUrl && selected ? (
            <div className="relative">
              {previewLoading && (
                <div
                  data-testid="preview-skeleton"
                  className="absolute inset-0 z-10 mx-auto aspect-square max-w-[520px] animate-pulse rounded-lg bg-muted"
                />
              )}
              <PreviewCanvas
                alt={selected.name}
                caption={t("previewNote")}
                layers={[{ src: previewUrl }]}
              />
            </div>
          ) : (
            <div
              data-testid="preview-placeholder"
              className="mx-auto flex aspect-square max-w-[520px] items-center justify-center rounded-lg bg-card text-sm text-muted-foreground shadow-(--shadow-card)"
            >
              {t("step1.title")}
            </div>
          )}
        </div>
        <div className="flex flex-col">
          <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {t("stepIndicator", { step: 1 })}
          </p>
          <h2 className="mb-4 mt-1 text-xl font-semibold">
            {t("step1.title")}
          </h2>
          <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {designs.map((design) => (
              <OptionCard
                key={design.id}
                label={design.name}
                supplierName={design.supplierName ?? undefined}
                selected={design.slug === state.designSlug}
                onSelect={() => select(design)}
              />
            ))}
          </div>
          <div className="mt-auto">
            <Button
              className="w-full"
              size="lg"
              disabled={!selected}
              data-testid="next-step"
            >
              {t("nextStepDetails")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
