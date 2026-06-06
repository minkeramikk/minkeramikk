"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Stepper } from "@/components/ui-domain/stepper";
import { SupplierBadge } from "@/components/ui-domain/supplier-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { assetUrl } from "@/lib/storage";
import { formatMoney, money } from "@/lib/money/money";
import type { Currency } from "@/lib/money/money";
import { useCart } from "@/lib/cart/use-cart";
import { cartTotal, lineSubtotal, type ConfigSnapshot } from "@/lib/cart/cart";

export interface CeramicProduct {
  id: string;
  slug: string;
  nameNo: string;
  nameEn: string;
  priceCents: number;
  currency: Currency;
  image: string | null;
}

export interface DesignRef {
  slug: string;
  name: string;
  supplierId: string;
  supplierName: string | null;
}

export function CeramicsStep({
  products,
  design,
  snapshot,
  configCode,
}: {
  products: CeramicProduct[];
  design: DesignRef;
  snapshot: ConfigSnapshot;
  configCode: string;
}) {
  const t = useTranslations("cart");
  const tc = useTranslations("configurator");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { cart, add, setQuantity, remove } = useCart();

  const [selectedId, setSelectedId] = useState<string | null>(
    products[0]?.id ?? null
  );
  const [qty, setQty] = useState(1);

  const selected = products.find((p) => p.id === selectedId) ?? null;
  const productName = (p: CeramicProduct) =>
    locale === "no" ? p.nameNo : p.nameEn;

  function addSelected() {
    if (!selected) return;
    add({
      productId: selected.id,
      productNameNo: selected.nameNo,
      productNameEn: selected.nameEn,
      supplierId: design.supplierId,
      supplierName: design.supplierName ?? "",
      unitPriceCents: selected.priceCents,
      currency: selected.currency,
      quantity: qty,
      configCode,
      configSnapshot: snapshot,
    });
    setQty(1);
  }

  const total = useMemo(() => cartTotal(cart), [cart]);

  return (
    <div data-testid="ceramics-step">
      <Stepper
        ariaLabel={tc("stepperLabel")}
        current={2}
        steps={[
          { label: tc("steps.design") },
          { label: tc("steps.details") },
          { label: tc("steps.ceramics") },
        ]}
      />

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* chooser */}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {tc("stepIndicator", { step: 3 })}
          </p>
          <h2 className="mt-1 mb-4 text-xl font-semibold">{t("title")}</h2>

          <div
            role="radiogroup"
            aria-label={t("title")}
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
          >
            {products.map((p) => {
              const isSel = p.id === selectedId;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  data-testid={`product-${p.slug}`}
                  onClick={() => setSelectedId(p.id)}
                  className={[
                    "flex min-h-11 flex-col items-center gap-1 rounded-sm border-[1.5px] p-2 text-center transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                    isSel
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-ring",
                  ].join(" ")}
                >
                  {p.image && (
                    // eslint-disable-next-line @next/next/no-img-element -- catalog art from storage
                    <img
                      src={assetUrl(p.image)}
                      alt=""
                      className="h-16 w-16 object-contain"
                    />
                  )}
                  <span className="text-xs font-medium">{productName(p)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatMoney(money(p.priceCents, p.currency), locale as "no" | "en")}
                  </span>
                </button>
              );
            })}
          </div>

          {/* quantity + add */}
          <div className="mt-5 flex items-center gap-3">
            <div className="flex items-center rounded-sm border">
              <button
                type="button"
                aria-label="-"
                data-testid="qty-dec"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex size-11 items-center justify-center text-lg"
              >
                −
              </button>
              <span
                data-testid="qty-value"
                className="w-10 text-center text-sm tabular-nums"
              >
                {qty}
              </span>
              <button
                type="button"
                aria-label="+"
                data-testid="qty-inc"
                onClick={() => setQty((q) => q + 1)}
                className="flex size-11 items-center justify-center text-lg"
              >
                +
              </button>
            </div>
            <Button
              className="min-h-11 flex-1"
              size="lg"
              disabled={!selected}
              data-testid="add-to-cart"
              onClick={addSelected}
            >
              {t("add")}
            </Button>
          </div>

          <div className="mt-4">
            <Button
              variant="outline"
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("step", "2");
                router.push(`${pathname}?${params.toString()}`, {
                  scroll: false,
                });
              }}
            >
              {t("backToDesign")}
            </Button>
          </div>
        </div>

        {/* cart */}
        <div className="min-w-0">
          <h2 className="mb-4 text-xl font-semibold">{t("cartTitle")}</h2>

          {cart.length === 0 ? (
            <Card data-testid="cart-empty">
              <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
                <Button asChild variant="outline">
                  <a href={`/${locale}/configurator`}>{t("emptyCta")}</a>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-3" data-testid="cart-list">
              {cart.map((line) => (
                <Card key={line.id} data-testid="cart-line">
                  <CardContent className="flex gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {locale === "no"
                          ? line.productNameNo
                          : line.productNameEn}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t("design")}: {line.configSnapshot?.designName ?? "—"}
                      </p>
                      {line.supplierName && (
                        <SupplierBadge name={line.supplierName} className="mt-1.5" />
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex items-center rounded-sm border">
                          <button
                            type="button"
                            aria-label="-"
                            onClick={() =>
                              setQuantity(line.id, line.quantity - 1)
                            }
                            className="flex size-9 items-center justify-center"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-sm tabular-nums">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label="+"
                            onClick={() =>
                              setQuantity(line.id, line.quantity + 1)
                            }
                            className="flex size-9 items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          data-testid="cart-remove"
                          onClick={() => remove(line.id)}
                          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        >
                          {t("remove")}
                        </button>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-medium tabular-nums">
                      {formatMoney(lineSubtotal(line), locale as "no" | "en")}
                    </div>
                  </CardContent>
                </Card>
              ))}

              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm text-muted-foreground">
                  {t("total")}
                </span>
                <span
                  data-testid="cart-total"
                  className="text-lg font-semibold tabular-nums"
                >
                  {formatMoney(total, locale as "no" | "en")}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
