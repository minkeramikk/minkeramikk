import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalArticle } from "@/components/site/legal-article";

/** Terms of sale (F12). English route path (i18n rule); copy from `legal.terms`. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.terms");
  return { title: t("title") };
}

export default async function TermsPage() {
  const t = await getTranslations("legal.terms");
  // R3-B4: the insurance policy is appended from `cart.insurance.policyTerms`
  // — the SAME source the cart row reads, never re-typed into `legal.terms.body`.
  const tInsurance = await getTranslations("cart.insurance");
  return (
    <LegalArticle
      title={t("title")}
      body={`${t("body")}\n\n${tInsurance("policyTerms")}`}
      testid="legal-terms"
    />
  );
}
