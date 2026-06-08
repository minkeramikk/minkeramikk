import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalArticle } from "@/components/site/legal-article";

/** Privacy policy (F12). English route path (i18n rule); copy from `legal.privacy`. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.privacy");
  return { title: t("title") };
}

export default async function PrivacyPage() {
  const t = await getTranslations("legal.privacy");
  return (
    <LegalArticle title={t("title")} body={t("body")} testid="legal-privacy" />
  );
}
