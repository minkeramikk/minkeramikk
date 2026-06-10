"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Stepper } from "@/components/ui-domain/stepper";
import { CartLineThumb } from "@/components/ui-domain/cart-line-thumb";
import { OrderForm } from "@/components/ui-domain/order-form";
import { Button } from "@/components/ui/button";
import { assetUrl } from "@/lib/storage";
import { formatMoney, money } from "@/lib/money/money";
import type { Currency } from "@/lib/money/money";
import { useCartContext } from "@/lib/cart/cart-context";
import {
  cartTotal,
  itemCount,
  lineSubtotal,
  type CartLine,
  type CartLayer,
  type ConfigSnapshot,
} from "@/lib/cart/cart";
import { cn } from "@/lib/utils";

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

/** First selection colour of a cart line → colour chip fallback. */
function thumbHex(line: CartLine): string | undefined {
  return line.configSnapshot?.selections.find((s) => s.hex)?.hex ?? undefined;
}

/**
 * Step 3 — two-panel layout (F21).
 *
 * Desktop (≥768): left = ceramic selector; right = docked inline cart always
 * visible (NOT the Sheet overlay). Adding a product appends a row in the right
 * panel with no overlay interruption.
 *
 * Mobile: stacked — selector first, then cart rows, then a sticky summary bar
 * at the bottom (N pcs · total · Send) that expands the inline checkout form.
 *
 * The CartDrawer Sheet (F16) remains active on steps 1–2 only, triggered from
 * the header icon — it is NOT opened here.
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
  const to = useTranslations("order");
  const locale = useLocale() as "no" | "en";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { cart, hydrated, add, setQuantity, remove, clear } = useCartContext();

  const [selectedId, setSelectedId] = useState<string | null>(
    products[0]?.id ?? null
  );
  const [qty, setQty] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  /** Mobile: controls the sticky bottom bar expansion for checkout. */
  const [mobileCheckoutOpen, setMobileCheckoutOpen] = useState(false);
  /** Desktop + mobile inline: expands the order form in the cart panel. */
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const selected = products.find((p) => p.id === selectedId) ?? null;
  const productName = (p: CeramicProduct) =>
    locale === "no" ? p.nameNo : p.nameEn;

  const count = hydrated ? itemCount(cart) : 0;
  const total = cartTotal(cart);

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
      layers: designLayers,
      plateImage: selected.image ? assetUrl(selected.image) : undefined,
    });
    setQty(1);
    setJustAdded(true);
  }

  async function copyCode(id: string, code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  // F18/F21: clickable stepper — jump to any step keeping design + opt_* in URL.
  function goToStep(target: 1 | 2 | 3) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("design", design.slug);
    if (target === 1) params.delete("step");
    else params.set("step", String(target));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const stepperSteps = [
    { label: tc("steps.design") },
    { label: tc("steps.details") },
    { label: tc("steps.ceramics") },
  ];

  // ── Docked cart panel (shared by desktop right column + mobile inline section) ──
  const cartPanel = (
    <div className="flex flex-col gap-0" data-testid="docked-cart">
      <h2 className="mb-3 text-base font-semibold">{t("cartTitle")}</h2>

      {count === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <div data-testid="cart-list" className="flex flex-col">
            {cart.map((line) => (
              <div
                key={line.id}
                data-testid="cart-line"
                className="flex gap-3 border-b border-border/60 py-3 last:border-0"
              >
                <CartLineThumb
                  layers={line.layers}
                  hex={thumbHex(line)}
                  plateImage={line.plateImage}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {locale === "no" ? line.productNameNo : line.productNameEn}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {line.configSnapshot?.designName ?? "—"}
                  </p>
                  {line.configCode && (
                    <div className="mt-1 flex items-center gap-2">
                      <code className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
                        {line.configCode}
                      </code>
                      <button
                        type="button"
                        data-testid="cart-copy-code"
                        onClick={() => copyCode(line.id, line.configCode)}
                        className="shrink-0 text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        {copiedId === line.id ? t("copied") : t("copyCode")}
                      </button>
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex items-center rounded-sm border border-border">
                      <button
                        type="button"
                        aria-label="-"
                        data-testid="docked-qty-dec"
                        onClick={() => setQuantity(line.id, line.quantity - 1)}
                        className="flex size-11 items-center justify-center sm:size-9"
                      >
                        −
                      </button>
                      <span className="w-7 text-center text-sm tabular-nums">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="+"
                        data-testid="docked-qty-inc"
                        onClick={() => setQuantity(line.id, line.quantity + 1)}
                        className="flex size-11 items-center justify-center sm:size-9"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      data-testid="docked-remove"
                      onClick={() => remove(line.id)}
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      {t("remove")}
                    </button>
                  </div>
                </div>
                <span className="shrink-0 text-right text-sm font-medium tabular-nums">
                  {formatMoney(lineSubtotal(line), locale)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("shipping")}</span>
              <span className="text-muted-foreground">{t("shippingIncluded")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("total")}</span>
              <span
                data-testid="docked-total"
                className="text-lg font-semibold tabular-nums"
              >
                {formatMoney(total, locale)}
              </span>
            </div>

            {checkoutOpen ? (
              <div data-testid="docked-checkout-form">
                <button
                  type="button"
                  data-testid="docked-back-to-cart"
                  onClick={() => setCheckoutOpen(false)}
                  className="mb-3 self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  ← {t("backToCart")}
                </button>
                <OrderForm
                  cart={cart}
                  onSuccess={() => {
                    clear();
                    setCheckoutOpen(false);
                  }}
                />
              </div>
            ) : (
              <Button
                size="lg"
                className="min-h-11 w-full"
                data-testid="docked-checkout"
                onClick={() => setCheckoutOpen(true)}
              >
                {to("title")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div data-testid="ceramics-step" className="max-md:pb-24">
      {/* F21: nav cluster — stepper always; Back active; Next disabled at step 3 */}
      <div className="mb-4 flex items-center gap-2" data-testid="step-nav">
        <Button
          variant="outline"
          size="lg"
          data-testid="back-step"
          className="min-h-11 shrink-0 max-md:hidden"
          onClick={() => goToStep(2)}
          aria-label={tc("back")}
        >
          ‹ {tc("back")}
        </Button>
        <Stepper
          ariaLabel={tc("stepperLabel")}
          current={2}
          steps={stepperSteps}
          onStepSelect={(i) => goToStep((i + 1) as 1 | 2 | 3)}
          className="mb-0 mt-0 flex-1"
        />
        {/* Last step has no "next" — the real submit is "Send" in the cart
            panel (a disabled nav button there was dead UI). A discreet
            secondary starts a new design, keeping the current selection +
            options in the URL (QA-fix #2). */}
        <Button
          variant="outline"
          size="lg"
          data-testid="new-design-nav"
          className="min-h-11 shrink-0 max-md:hidden"
          onClick={() => goToStep(1)}
        >
          + {tc("newDesign")}
        </Button>
      </div>

      {/* F21: mobile-only sticky summary bar for step 3 */}
      <div
        data-testid="step-nav-mobile"
        className={cn(
          "md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background",
          "shadow-[0_-2px_12px_color-mix(in_oklab,var(--mk-dark)_10%,transparent)]"
        )}
      >
        {mobileCheckoutOpen ? (
          <div className="flex flex-col gap-3 p-4">
            <button
              type="button"
              onClick={() => setMobileCheckoutOpen(false)}
              className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              ← {t("backToCart")}
            </button>
            <OrderForm
              cart={cart}
              onSuccess={() => {
                clear();
                setMobileCheckoutOpen(false);
              }}
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3">
            <Button
              variant="outline"
              size="lg"
              className="min-h-11 shrink-0"
              data-testid="back-step-mobile"
              onClick={() => goToStep(2)}
            >
              {tc("back")}
            </Button>
            <div className="min-w-0 flex-1 truncate text-sm">
              <span className="font-medium tabular-nums">
                {t("itemCount", { count })}
              </span>
              {count > 0 && (
                <span className="ml-2 text-muted-foreground tabular-nums">
                  · {formatMoney(total, locale)}
                </span>
              )}
            </div>
            <Button
              size="lg"
              data-testid="mobile-send"
              className="min-h-11 shrink-0"
              disabled={count === 0}
              onClick={() => setMobileCheckoutOpen(true)}
            >
              {to("title")}
            </Button>
          </div>
        )}
      </div>

      {/* F21: two-column grid on desktop; single column + stacked cart on mobile */}
      <div className="grid grid-cols-1 items-start gap-7 md:grid-cols-2">
        {/* LEFT: ceramic selector */}
        <div className="flex min-w-0 flex-col">
          <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {tc("stepIndicator", { step: 3 })}
          </p>
          <h2 className="mb-4 mt-1 text-xl font-semibold">{t("title")}</h2>

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
                    {formatMoney(
                      money(p.priceCents, p.currency),
                      locale as "no" | "en"
                    )}
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

          {/* add feedback + "start a new design" CTA (QA-fix #2): returns to
              step 1 keeping the current design + options in the URL; the cart
              (with the item just added) is left untouched. */}
          {justAdded && (
            <div
              data-testid="add-feedback-block"
              className="mt-2 flex flex-col items-start gap-2"
            >
              <p
                data-testid="add-feedback"
                aria-live="polite"
                className="text-sm text-muted-foreground"
              >
                {t("added")}
              </p>
              <Button
                variant="outline"
                size="lg"
                className="min-h-11"
                data-testid="new-design-cta"
                onClick={() => goToStep(1)}
              >
                {tc("newDesign")} →
              </Button>
            </div>
          )}

          {/* Mobile: docked cart section (below selector, above sticky bar) */}
          <div className="mt-6 md:hidden" data-testid="mobile-cart-section">
            {cartPanel}
          </div>
        </div>

        {/* RIGHT (desktop only): docked cart always visible */}
        <div
          className="hidden min-w-0 rounded-sm border border-border bg-card p-5 md:block md:sticky md:top-4 md:self-start"
          data-testid="docked-cart-panel"
        >
          {cartPanel}
        </div>
      </div>
    </div>
  );
}
