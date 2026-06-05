import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { getActiveDesigns } from "@/lib/catalog/designs";
import { getDesignDetail } from "@/lib/catalog/design-options";
import { DesignStep } from "./design-step";
import { DetailsStep } from "./details-step";

// Catalog is live data: render per-request so back-office changes
// (e.g. a design switched to active=false) are reflected immediately (AC4 F01).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("configurator");
  return { title: t("pageTitle") };
}

type SearchParams = Promise<{ design?: string; step?: string }>;

export default async function ConfiguratorPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { design: designSlug, step } = await searchParams;
  const [designs, t] = await Promise.all([
    getActiveDesigns(),
    getTranslations("configurator"),
  ]);

  const selected = designSlug
    ? designs.find((d) => d.slug === designSlug)
    : undefined;

  // step 2 only when a valid active design is selected
  const detail =
    step === "2" && selected ? await getDesignDetail(selected.slug) : null;

  return (
    <section>
      <h1 className="sr-only">{t("pageTitle")}</h1>
      <Suspense>
        {detail && selected ? (
          <DetailsStep detail={detail} supplierId={selected.supplierId} />
        ) : (
          <DesignStep designs={designs} />
        )}
      </Suspense>
    </section>
  );
}
