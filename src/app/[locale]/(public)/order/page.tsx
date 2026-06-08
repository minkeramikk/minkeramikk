import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("order");
  return { title: t("confirmTitle") };
}

type SearchParams = Promise<{ code?: string }>;

/** Order confirmation page (F05): shows the order code after a successful submit. */
export default async function OrderConfirmationPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { code } = await searchParams;
  const t = await getTranslations("order");

  if (!code) {
    return (
      <section className="mx-auto max-w-xl py-20 text-center">
        <h1 className="text-2xl font-semibold">{t("emptyTitle")}</h1>
        <p className="mt-3 text-muted-foreground">{t("emptyBody")}</p>
        <Button asChild className="mt-6 rounded-mk px-8">
          <Link href="/configurator">{t("confirmCta")}</Link>
        </Button>
      </section>
    );
  }

  return (
    <section
      className="mx-auto max-w-xl py-20 text-center"
      data-testid="order-confirmation"
    >
      <h1 className="font-heading text-3xl">{t("confirmTitle")}</h1>
      <p className="mt-4 text-muted-foreground">
        {t("confirmBody", { code })}
      </p>
      <p
        className="mt-6 inline-block rounded-md bg-muted px-4 py-2 font-mono text-lg"
        data-testid="order-code"
      >
        {code}
      </p>
      <div className="mt-8">
        <Button asChild variant="outline" className="rounded-mk px-8">
          <Link href="/configurator">{t("confirmCta")}</Link>
        </Button>
      </div>
    </section>
  );
}
