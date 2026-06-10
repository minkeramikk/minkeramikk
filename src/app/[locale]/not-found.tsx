import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

/**
 * Branded 404 for unmatched routes under /[locale] (CQ-2). Server component —
 * next-intl resolves the locale from the URL (falling back to the default), so
 * the copy is localized NO/EN. A totally out-of-locale URL is redirected to the
 * default locale by the middleware (localePrefix: "always") and lands here too.
 */
export default async function LocaleNotFound() {
  const t = await getTranslations("notFound");
  const tc = await getTranslations("common");

  return (
    <main
      data-testid="not-found-page"
      className="flex min-h-[70vh] flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center"
    >
      <Link
        href="/"
        className="font-heading text-lg font-semibold text-foreground"
      >
        {tc("siteName")}
      </Link>

      <div className="max-w-md">
        <p
          aria-hidden
          className="font-heading text-6xl font-semibold text-muted-foreground/30"
        >
          404
        </p>
        <h1 className="mt-1 font-heading text-2xl font-semibold text-foreground">
          {t("title")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("body")}</p>
      </div>

      <Button asChild size="lg" data-testid="not-found-home">
        <Link href="/configurator">{t("cta")}</Link>
      </Button>
    </main>
  );
}
