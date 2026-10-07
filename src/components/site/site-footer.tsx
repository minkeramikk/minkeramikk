import { useTranslations } from "next-intl";
import { LEGAL } from "@/lib/site/legal-links";

/**
 * Site footer — one simple line at the very bottom of every public page
 * (mobile + desktop): site name · legal links · contact · copyright. Wraps
 * gracefully on narrow screens, stays a single compact strip.
 */
export function SiteFooter() {
  const t = useTranslations();

  return (
    // Bug (client, 7/10): on a phone the configurator must end at its own
    // «Neste»/order bar, not scroll past it into a footer — hidden under md
    // whenever the page carries `data-configurator` (configurator/page.tsx).
    // Legal links stay reachable from the order form itself.
    <footer
      data-site-footer
      className="mt-auto border-t max-md:[body:has([data-configurator])_&]:hidden"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-4 text-xs text-muted-foreground">
        <span className="font-heading text-sm text-foreground">
          {t("common.siteName")}
        </span>
        <a
          href={LEGAL.privacy}
          data-testid="footer-privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground"
        >
          {t("footer.privacy")}
        </a>
        <a
          href={LEGAL.terms}
          data-testid="footer-terms"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground"
        >
          {t("footer.terms")}
        </a>
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
