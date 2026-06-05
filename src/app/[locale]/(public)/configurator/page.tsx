import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { getActiveDesigns } from "@/lib/catalog/designs";
import { DesignStep } from "./design-step";

// Catalog is live data: render per-request so back-office changes
// (e.g. a design switched to active=false) are reflected immediately (AC4).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("configurator");
  return { title: t("pageTitle") };
}

export default async function ConfiguratorPage() {
  const [designs, t] = await Promise.all([
    getActiveDesigns(),
    getTranslations("configurator"),
  ]);

  return (
    <section>
      <h1 className="sr-only">{t("pageTitle")}</h1>
      <Suspense>
        <DesignStep designs={designs} />
      </Suspense>
    </section>
  );
}
