import type { Metadata } from "next";
import { useTranslations } from "next-intl";

export const metadata: Metadata = { title: "Bygg din design" };

export default function ByggDinDesignPage() {
  const t = useTranslations("configurator");
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-3xl sm:text-4xl">{t("pageTitle")}</h1>
      {/* TODO fase 2: configuratore 3 step */}
    </section>
  );
}
