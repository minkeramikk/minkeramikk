import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { getActiveDesigns } from "@/lib/catalog/designs";
import { getDesignDetail } from "@/lib/catalog/design-options";
import { getSupplierProducts } from "@/lib/catalog/products";
import { DesignStep } from "./design-step";
import { DetailsStep } from "./details-step";
import { CeramicsStep } from "./ceramics-step";
import type { ConfigSnapshot } from "@/lib/cart/cart";

// Catalog is live data: render per-request so back-office changes
// (e.g. a design switched to active=false) are reflected immediately (AC4 F01).
export const dynamic = "force-dynamic";

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

  const selected = designSlug
    ? designs.find((d) => d.slug === designSlug)
    : undefined;

  // steps 2 and 3 need a valid active design selected
  const detail =
    (step === "2" || step === "3") && selected
      ? await getDesignDetail(selected.slug)
      : null;

  if (step === "3" && selected && detail) {
    const products = await getSupplierProducts(selected.supplierId);

    // build the readable snapshot from the current opt_* selections
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

    // interim config_code = the configurator query string (reloadable);
    // F04 will formalize the canonical code format (ADR 0002).
    const codeParams = new URLSearchParams();
    codeParams.set("design", selected.slug);
    for (const c of detail.categories) {
      const v = params[`opt_${c.slug}`];
      if (typeof v === "string") codeParams.set(`opt_${c.slug}`, v);
    }
    const configCode = codeParams.toString();

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
          />
        </Suspense>
      </section>
    );
  }

  return (
    <section>
      <h1 className="sr-only">{t("pageTitle")}</h1>
      <Suspense>
        {step === "2" && detail && selected ? (
          <DetailsStep detail={detail} supplierId={selected.supplierId} />
        ) : (
          <DesignStep designs={designs} />
        )}
      </Suspense>
    </section>
  );
}
