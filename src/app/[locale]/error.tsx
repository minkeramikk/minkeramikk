"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

/**
 * Branded error boundary for everything under /[locale] (CQ-2). The customer
 * never sees Next's default error screen or a stack trace — the technical
 * detail is logged server-side/console only. i18n NO/EN comes from the locale
 * layout's NextIntlClientProvider.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");
  const tc = useTranslations("common");

  useEffect(() => {
    // Diagnostics only — nothing technical reaches the UI.
    console.error("[locale error boundary]", error);
  }, [error]);

  return (
    <main
      data-testid="error-page"
      className="flex min-h-[70vh] flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center"
    >
      <Link
        href="/"
        className="font-heading text-lg font-semibold text-foreground"
      >
        {tc("siteName")}
      </Link>

      <div className="max-w-md">
        <h1 className="font-heading text-2xl font-semibold text-foreground">
          {t("title")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("body")}</p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" data-testid="error-retry" onClick={() => reset()}>
          {t("retry")}
        </Button>
        <Button asChild size="lg" variant="outline" data-testid="error-home">
          <Link href="/configurator">{t("cta")}</Link>
        </Button>
      </div>
    </main>
  );
}
