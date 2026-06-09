"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Stepper } from "@/components/ui-domain/stepper";
import { Button } from "@/components/ui/button";
import { assetUrl } from "@/lib/storage";
import { formatMoney, money } from "@/lib/money/money";
import type { Currency } from "@/lib/money/money";
import { useCartContext } from "@/lib/cart/cart-context";
import { itemCount, type CartLayer, type ConfigSnapshot } from "@/lib/cart/cart";

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

/**
 * Step 3 — ceramics chooser (F03 + F16). The customer picks a piece and adds
 * it to the cart; the cart VIEW and checkout now live in the shared CartDrawer
 * (F16), not inline here. Adding updates the shared cart → the header badge
 * reflects it immediately.
 */
export function CeramicsStep({
  products,
  design,
  snapshot,
  configCode,
  designLayers,
}: {
  products: CeramicProduct[];
  design: DesignRef;
  snapshot: ConfigSnapshot;
  configCode: string;
  /** F19: composited design layers (no plate); plate prepended at add-time. */
  designLayers: CartLayer[];
}) {
  const t = useTranslations("cart");
  const tc = useTranslations("configurator");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { cart, add, openCart } = useCartContext();

  const [selectedId, setSelectedId] = useState<string | null>(
    products[0]?.id ?? null
  );
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

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
      // F19: pattern-only mini (clean centre) + the chosen ceramic as a separate
      // small image below it.
      layers: designLayers,
      plateImage: selected.image ? assetUrl(selected.image) : undefined,
    });
    setQty(1);
    setJustAdded(true);
  }

  const count = itemCount(cart);

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

      <div className="mx-auto max-w-xl">
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

        {/* feedback + entry to the cart drawer (checkout lives there, F16) */}
        {count > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <span
              data-testid="add-feedback"
              aria-live="polite"
              className="text-sm text-muted-foreground"
            >
              {justAdded ? t("added") : ""}
            </span>
            <Button
              variant="outline"
              data-testid="open-cart"
              onClick={openCart}
            >
              {t("viewBasket")}
            </Button>
          </div>
        )}

        {/* F19: the config code moved to the cart drawer rows (each line carries
            its own code + reopen); step 3 keeps only the back action. */}
        <div className="mt-4 flex flex-col gap-4">
          <Button
            variant="outline"
            className="self-start"
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
    </div>
  );
}
