import type { Metadata } from "next";
import { Suspense } from "react";
import ReactDOM from "react-dom";
import { getTranslations } from "next-intl/server";
import { getActiveDesigns } from "@/lib/catalog/designs";
import { getDesignDetail, type DesignDetail } from "@/lib/catalog/design-options";
import { getSupplierProducts } from "@/lib/catalog/products";
import { assetUrl } from "@/lib/storage";
import { encodeConfigCode, toCodecDesign } from "@/lib/configurator/config-code";
import { getPreviewLayers } from "@/lib/configurator/preview";
import { ConfiguratorClient } from "./configurator-client";
import { CeramicsStep } from "./ceramics-step";
import type { ConfigSnapshot } from "@/lib/cart/cart";

// Catalog is live data: render per-request so back-office changes
// (e.g. a design switched to active=false) are reflected immediately.
export const dynamic = "force-dynamic";

const PREVIEW_WIDTH = 800;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("configurator");
  return { title: t("pageTitle") };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ConfiguratorPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const designSlug =
    typeof params.design === "string" ? params.design : undefined;
  const step = typeof params.step === "string" ? params.step : undefined;

  const [designs, t] = await Promise.all([
    getActiveDesigns(),
    getTranslations("configurator"),
  ]);

  const selected =
    (designSlug ? designs.find((d) => d.slug === designSlug) : undefined) ??
    designs[0]; // sort_order=1 default (F14 AC1)

  // ── step 3: ceramics + cart (separate layout, no shared preview) ──
  if (step === "3" && selected) {
    const [detail, products] = await Promise.all([
      getDesignDetail(selected.slug),
      getSupplierProducts(selected.supplierId),
    ]);
    if (detail) {
      const selections = detail.categories.map((c) => {
        const optId =
          typeof params[`opt_${c.slug}`] === "string"
            ? (params[`opt_${c.slug}`] as string)
            : undefined;
        const opt = c.options.find((o) => o.id === optId) ?? c.options[0];
        return {
          label: (c.labelNo ?? c.slug) as string,
          option: opt?.name ?? "",
          hex: opt?.hex ?? null,
        };
      });
      const snapshot: ConfigSnapshot = {
        designSlug: selected.slug,
        designName: selected.name,
        selections,
      };
      // canonical config code (ADR 0011) — the SAME format F05/F08 reuse
      const selById: Record<string, string> = {};
      for (const c of detail.categories) {
        const v = params[`opt_${c.slug}`];
        const opt =
          (typeof v === "string" && c.options.find((o) => o.id === v)) ||
          c.options[0];
        if (opt) selById[c.slug] = opt.id;
      }
      const codec = toCodecDesign(detail);
      const configCode = codec
        ? encodeConfigCode(codec, selById)
        : `MK-${selected.slug}`;

      // F19: composited design layers (no plate) for the cart-row mini preview,
      // resolved at the SAME width the big preview uses so the browser image
      // cache hits → instant thumbnail. The plate is prepended at add-time.
      const designLayers = getPreviewLayers(
        null,
        detail.categories.map((c) => {
          const opt =
            c.options.find((o) => o.id === selById[c.slug]) ?? c.options[0];
          return { layerSlot: c.layerSlot, layerImage: opt?.layerImage ?? null };
        })
      ).map((l) => ({
        src: assetUrl(l.src, { width: PREVIEW_WIDTH }),
        recolor: l.blend === "multiply",
      }));

      return (
        <section>
          <h1 className="sr-only">{t("pageTitle")}</h1>
          <Suspense>
            <CeramicsStep
              products={products.map((p) => ({
                id: p.id,
                slug: p.slug,
                nameNo: p.nameNo,
                nameEn: p.nameEn,
                priceCents: p.price.amountCents,
                currency: p.price.currency,
                image: p.image,
              }))}
              design={{
                slug: selected.slug,
                name: selected.name,
                supplierId: selected.supplierId,
                supplierName: selected.supplierName,
              }}
              snapshot={snapshot}
              configCode={configCode}
              designLayers={designLayers}
            />
          </Suspense>
        </section>
      );
    }
  }

  // ── steps 1 & 2: unified shell with the persistent preview ──
  // Details for every design so the client can switch design/step without a
  // server roundtrip (keeps the preview stable).
  const details = await Promise.all(
    designs.map((d) => getDesignDetail(d.slug))
  );
  const detailsBySlug: Record<string, DesignDetail> = {};
  designs.forEach((d, i) => {
    const detail = details[i];
    if (detail) detailsBySlug[d.slug] = detail;
  });

  // Preload the default design's composed layers so the first paint is the
  // composed plate, not a hole/skeleton (F14 AC1).
  for (const layer of selected.defaultLayers) {
    ReactDOM.preload(assetUrl(layer.src, { width: PREVIEW_WIDTH }), {
      as: "image",
      fetchPriority: "high",
    });
  }

  return (
    <section>
      <h1 className="sr-only">{t("pageTitle")}</h1>
      <Suspense>
        <ConfiguratorClient designs={designs} detailsBySlug={detailsBySlug} />
      </Suspense>
    </section>
  );
}
