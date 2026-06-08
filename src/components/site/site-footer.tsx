import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function SiteFooter() {
  const t = useTranslations();

  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
        <div className="font-heading text-lg">{t("common.siteName")}</div>
        <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
          <Link
            href="/privacy"
            data-testid="footer-privacy"
            className="hover:text-foreground"
          >
            {t("footer.privacy")}
          </Link>
          <Link
            href="/terms"
            data-testid="footer-terms"
            className="hover:text-foreground"
          >
            {t("footer.terms")}
          </Link>
        </nav>
        <div className="text-sm sm:text-right">
          <a
            href={`mailto:${t("common.email")}`}
            className="underline underline-offset-4 hover:text-muted-foreground"
          >
            {t("common.email")}
          </a>
          <p className="mt-2 text-muted-foreground">
            {t("footer.copyright", { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </footer>
  );
}
