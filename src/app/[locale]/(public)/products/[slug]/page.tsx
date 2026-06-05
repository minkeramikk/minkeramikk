import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProduct, getProducts } from "@/lib/data";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string; slug: string }> };

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    getProducts().map(({ slug }) => ({ locale, slug }))
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  return { title: product?.name ?? "Produkt" };
}

export default async function ProduktPage({ params }: Props) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  const t = await getTranslations("product");
  const tp = await getTranslations("products");

  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2">
      <div className="relative aspect-square rounded-xl border bg-card">
        <Image
          src={product.image}
          alt={product.name}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-contain p-8"
        />
      </div>
      <div className="flex flex-col justify-center gap-6">
        <div>
          <h1 className="text-3xl sm:text-4xl">{product.name}</h1>
          <Badge variant="secondary" className="mt-4 text-base">
            {tp("price", { price: product.priceKr })}
          </Badge>
        </div>
        <p className="text-muted-foreground">{t("description")}</p>
        <div className="flex flex-wrap gap-4">
          <Button asChild size="lg" className="rounded-mk px-8">
            <Link href="/configurator">{t("ctaDesign")}</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-mk px-8">
            <Link href="/products">{t("ctaAll")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
