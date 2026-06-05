import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { ProductCard } from "@/components/site/product-card";
import { getProducts } from "@/lib/data";

export const metadata: Metadata = { title: "Produkter" };

export default function ProdukterPage() {
  const t = useTranslations("products");
  const products = getProducts();
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t("intro")}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </div>
    </section>
  );
}
