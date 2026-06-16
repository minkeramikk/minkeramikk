import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { CartLineThumb } from "@/components/ui-domain/cart-line-thumb";
import { resolveSetPreviews } from "@/lib/orders/set-preview";
import { siteUrl } from "@/lib/site";
import { OrderShareButton } from "./share-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("order");
  return { title: t("confirmTitle") };
}

type Params = Promise<{ locale: string }>;
type SearchParams = Promise<{ code?: string; set?: string }>;

/**
 * Order confirmation (F05 + F30-B). Stateless: it never reads the orders table
 * — the code comes from the URL and the set recap is recomposed from the CA-3
 * `set=` param against the public catalog. Degrades cleanly: no `set=` → just
 * the code; no `code=` → empty state.
 */
export default async function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { locale } = await params;
  const { code, set } = await searchParams;
  const t = await getTranslations("order");

  if (!code) {
    return (
      <section className="mx-auto max-w-xl py-20 text-center">
        <h1 className="text-2xl font-semibold">{t("emptyTitle")}</h1>
        <p className="mt-3 text-muted-foreground">{t("emptyBody")}</p>
        <Button asChild className="mt-6 rounded-mk px-8">
          <Link href="/configurator">{t("confirmCta")}</Link>
        </Button>
      </section>
    );
  }

  const lines = await resolveSetPreviews(set, locale === "no" ? "no" : "en");
  const shareUrl = set
    ? `${siteUrl()}/${locale}/configurator?set=${encodeURIComponent(set)}`
    : null;

  return (
    <section
      className="mx-auto max-w-xl px-4 py-16 text-center"
      data-testid="order-confirmation"
    >
      <h1 className="font-heading text-3xl">{t("confirmTitle")}</h1>
      <p className="mt-3 text-muted-foreground">{t("confirmBody", { code })}</p>

      {/* big code + save invite */}
      <p
        className="mt-8 inline-block rounded-xl bg-muted px-8 py-4 font-mono text-3xl font-bold tracking-wide text-primary"
        data-testid="order-code"
      >
        {code}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">{t("saveInvite")}</p>

      {/* set recap — mini-plates, NO prices (F30-B) */}
      {lines.length > 0 && (
        <div className="mt-10 text-left" data-testid="order-recap">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {t("recapTitle")}
          </h2>
          <ul className="flex flex-col gap-3">
            {lines.map((l, i) => (
              <li
                key={i}
                data-testid="order-recap-line"
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                <CartLineThumb
                  layers={l.layers.length > 0 ? l.layers : undefined}
                  plateImage={l.plateImage ?? undefined}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {l.qty}× {l.productName}
                  </p>
                  {l.designName && (
                    <p className="truncate text-xs text-muted-foreground">
                      {l.designName}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        {shareUrl && <OrderShareButton url={shareUrl} />}
        <Button asChild variant="outline" className="rounded-mk px-8">
          <Link href="/configurator">{t("confirmCta")}</Link>
        </Button>
      </div>
    </section>
  );
}
