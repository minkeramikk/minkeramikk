import { useTranslations } from "next-intl";
import { Hero } from "@/components/site/hero";
import { DesignShowcase } from "@/components/site/design-showcase";
import { HowItWorks } from "@/components/site/how-it-works";
import { ProductCard } from "@/components/site/product-card";
import { Button } from "@/components/ui/button";
import { getProducts } from "@/lib/data";
import { Link } from "@/i18n/navigation";

export default function HomePage() {
  const t = useTranslations("home.featured");
  const featured = getProducts().slice(0, 4);
  return (
    <>
      <Hero />
      <DesignShowcase />
      <HowItWorks />
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="mb-10 text-center">
          <h2 className="text-3xl">{t("title")}</h2>
          <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {featured.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <Button asChild variant="outline" className="rounded-mk px-8">
            <Link href="/produkter">{t("ctaAll")}</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
