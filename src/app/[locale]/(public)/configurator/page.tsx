import type { Metadata } from "next";
import ReactDOM from "react-dom";
import { getTranslations } from "next-intl/server";
import { getActiveDesigns } from "@/lib/catalog/designs";
import { getDesignDetail, type DesignDetail } from "@/lib/catalog/design-options";
import { getSupplierProducts, getDesignProducts } from "@/lib/catalog/products";
import { assetUrl } from "@/lib/storage";
import { buildConfigLinePayload } from "@/lib/configurator/line-payload";
import { pickDefaultOption } from "@/lib/configurator/default-option";
import { getFeaturedConfigs } from "@/lib/catalog/featured";
import { FeaturedStrip } from "./featured-strip";
import { ConfiguratorClient } from "./configurator-client";
import { CeramicsStep } from "./ceramics-step";
import { resolveSharedSet } from "./resolve-shared-set";

// Catalog reads go through the `catalog`-tagged data cache (PERF-1 / P-1): no
// force-dynamic, so on a cache hit the configurator render issues ~0 catalog
// queries. Admin writes call revalidateTag('catalog') to keep it fresh.

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
    // Default to the first design that actually composes a preview, so an active
    // but layer-less design (e.g. a freshly created one) never blanks the
    // configurator's default view. Falls back to the first design (F14 AC1).
    designs.find((d) => d.defaultLayers.length > 0) ??
    designs[0];

  // ── step 3: ceramics + cart (separate layout, no shared preview) ──
  if (step === "3" && selected) {
    const [detail, products] = await Promise.all([
      getDesignDetail(selected.slug),
      getDesignProducts(selected.id, selected.supplierId),
    ]);
    if (detail) {
      // snapshot + canonical code (ADR 0011) + F19 mini-preview layers, all
      // from the shared builder (CA-3: the set landing reuses it so shared
      // lines come out byte-identical to manual adds).
      const selById: Record<string, string> = {};
      for (const c of detail.categories) {
        const v = params[`opt_${c.slug}`];
        const opt =
          (typeof v === "string" && c.options.find((o) => o.id === v)) ||
          // R2-1a: untouched category falls back to the cover default
          // (is_default else first-by-sort_order), matching steps 1-2.
          pickDefaultOption(c.options);
        if (opt) selById[c.slug] = opt.id;
      }
      // R2-2b: the free-text note rides the WORKING url (never the config code
      // nor the set= link). Honour it only when the design accepts notes.
      const rawNote = typeof params.note === "string" ? params.note : "";
      const customNote = detail.acceptsCustomNotes ? rawNote : "";
      const rawText = typeof params.text === "string" ? params.text : "";
      const customText = detail.acceptsCustomText ? rawText : "";
      const { snapshot, configCode, designLayers } = buildConfigLinePayload(
        detail,
        selById,
        customNote,
        customText
      );

      // CA-3: a `set=` param is a shared basket — resolve it server-side
      // (multi-supplier, live prices); the client applies/asks and then
      // consumes the param.
      const rawSet = typeof params.set === "string" ? params.set : "";
      const sharedSet = rawSet ? await resolveSharedSet(rawSet) : null;

      // No <Suspense> around the client steps: the page already awaits all
      // data (dynamic via `await searchParams`), so the boundary never showed
      // a fallback — it only made React stream the subtree as a hidden
      // `div#S:0` at the end of <body>, briefly leaving TWO copies of the
      // step in the DOM (flaky Playwright strict-mode violations).
      return (
        <section>
          <h1 className="sr-only">{t("pageTitle")}</h1>
          <CeramicsStep
              products={products.map((p) => ({
                id: p.id,
                slug: p.slug,
                nameNo: p.nameNo,
                nameEn: p.nameEn,
                priceCents: p.price.amountCents,
                currency: p.price.currency,
                image: p.image,
                pieces: p.pieces,
                descriptionNo: p.descriptionNo,
                descriptionEn: p.descriptionEn,
                attributes: p.attributes,
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
              sharedSet={sharedSet}
            />
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

  // CA-6: light data for the step-2 "what's next" teaser — 3 product thumbs
  // per supplier (the selected design switches client-side, so cover every
  // supplier on the page). Catalog-cached (PERF-1) → ~0 extra queries.
  const supplierIds = [...new Set(designs.map((d) => d.supplierId))];
  const productsPerSupplier = await Promise.all(
    supplierIds.map((id) => getSupplierProducts(id))
  );
  const teaserProducts: Record<string, string[]> = {};
  supplierIds.forEach((id, i) => {
    teaserProducts[id] = productsPerSupplier[i]
      .map((p) => p.image)
      .filter((img): img is string => Boolean(img))
      .slice(0, 3);
  });

  // Preload the default design's composed layers so the first paint is the
  // composed plate, not a hole/skeleton (F14 AC1).
  // F26.1 invariant: preload URL === render URL (both class-derived @512),
  // otherwise the browser downloads two variants of every layer.
  for (const layer of selected.defaultLayers) {
    ReactDOM.preload(assetUrl(layer.src), {
      as: "image",
      fetchPriority: "high",
    });
  }

  // F28: admin-curated featured strip, home/step 1 only (ADR 0016). Valid
  // rows only — an entry that no longer resolves is hidden here, badged in
  // admin. Cache tags featured+catalog → ~0 queries on hit. 0 valid → the
  // section does not exist and the home is identical to before.
  const featured =
    step !== "2" ? (await getFeaturedConfigs()).filter((f) => f.valid) : [];

  return (
    <section>
      <h1 className="sr-only">{t("pageTitle")}</h1>
      {/* no <Suspense>: see the step-3 note above */}
      <ConfiguratorClient
        designs={designs}
        detailsBySlug={detailsBySlug}
        teaserProducts={teaserProducts}
        featuredSlot={
          featured.length > 0 ? (
            <FeaturedStrip
              key="featured-strip"
              items={featured.map((f) => ({
                id: f.id,
                kind: f.kind,
                payload: f.payload,
                thumbUrl: assetUrl(f.thumbImage),
                labelNo: f.labelNo,
                labelEn: f.labelEn,
                designName: f.designName ?? "",
                designNameEn: f.designNameEn ?? "",
                setCount: f.setCount,
              }))}
            />
          ) : null
        }
      />
    </section>
  );
}
