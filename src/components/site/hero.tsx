import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export function Hero() {
  const t = useTranslations("home.hero");

  return (
    <section className="bg-accent">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-24 text-center">
        <h1 className="text-balance text-4xl leading-tight text-accent-foreground sm:text-6xl">
          {t("title")}
        </h1>
        <p className="max-w-2xl text-pretty text-accent-foreground/80">
          {t("text")}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg" className="rounded-mk px-8">
            <Link href="/bygg-din-design">{t("ctaConfigurator")}</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="rounded-mk border-accent-foreground/30 bg-transparent px-8 text-accent-foreground hover:bg-accent-foreground/10"
          >
            <Link href="/produkter">{t("ctaProducts")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
