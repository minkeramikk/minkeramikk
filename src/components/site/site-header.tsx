import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/site/locale-switcher";

export function SiteHeader() {
  const t = useTranslations();

  return (
    <header className="bg-accent">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="font-heading text-xl text-accent-foreground">
          {t("common.siteName")}
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/produkter"
            className="text-accent-foreground/80 transition-colors hover:text-accent-foreground"
          >
            {t("nav.products")}
          </Link>
          <Link
            href="/bygg-din-design"
            className="text-accent-foreground/80 transition-colors hover:text-accent-foreground"
          >
            {t("nav.configurator")}
          </Link>
          <LocaleSwitcher />
          <Button asChild size="sm" className="rounded-mk px-5">
            <a href={`mailto:${t("common.email")}`}>{t("nav.contact")}</a>
          </Button>
        </nav>
      </div>
    </header>
  );
}
