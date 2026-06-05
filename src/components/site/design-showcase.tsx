import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getDesigns } from "@/lib/data";

export function DesignShowcase() {
  const t = useTranslations("home.designs");
  const designs = getDesigns();

  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="mb-10 text-center">
        <h2 className="text-3xl">{t("title")}</h2>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {designs.map((design) => (
          <Link key={design.slug} href="/bygg-din-design">
            <Card className="group overflow-hidden py-0 transition-shadow hover:shadow-md">
              <CardContent className="p-0">
                <div className="relative aspect-square bg-card">
                  {design.previewImage && (
                    <Image
                      src={design.previewImage}
                      alt={design.name}
                      fill
                      sizes="(max-width: 640px) 50vw, 33vw"
                      className="object-contain p-6 transition-transform duration-300 group-hover:scale-105"
                    />
                  )}
                </div>
                <div className="border-t p-4 text-center">
                  <h3 className="font-heading text-base">{design.name}</h3>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
