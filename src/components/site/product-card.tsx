import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Product } from "@/lib/data";

export function ProductCard({ product }: { product: Product }) {
  const t = useTranslations("products");

  return (
    <Link href={`/produkter/${product.slug}`}>
      <Card className="group h-full overflow-hidden py-0 transition-shadow hover:shadow-md">
        <CardContent className="p-0">
          <div className="relative aspect-square bg-card">
            <Image
              src={product.image}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 50vw, 25vw"
              className="object-contain p-4 transition-transform duration-300 group-hover:scale-105"
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-t p-4">
            <h3 className="text-sm font-medium">{product.name}</h3>
            <Badge variant="secondary" className="shrink-0">
              {t("price", { price: product.priceKr })}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
