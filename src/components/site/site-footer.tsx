import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Site footer — one simple line at the very bottom of every public page
 * (mobile + desktop): site name · legal links · contact · copyright. Wraps
 * gracefully on narrow screens, stays a single compact strip.
 */
export function SiteFooter() {
  const t = useTranslations();

  return (
    <footer data-site-footer className="mt-auto border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-4 text-xs text-muted-foreground">
        <span className="font-heading text-sm text-foreground">
          {t("common.siteName")}
        </span>
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
        <a
          href={`mailto:${t("common.email")}`}
          className="underline underline-offset-4 hover:text-foreground"
        >
          {t("common.email")}
        </a>
        <span>{t("footer.copyright", { year: new Date().getFullYear() })}</span>
      </div>
    </footer>
  );
}
