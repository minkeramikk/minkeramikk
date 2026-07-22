"use client";

import { useLocale, useTranslations } from "next-intl";
import { ShoppingBag, Truck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NextStepPill, PillIcon } from "@/components/ui-domain/next-step-pill";
import { OrderForm } from "@/components/ui-domain/order-form";
import { CartLineThumb } from "@/components/ui-domain/cart-line-thumb";
import { CartLineRecap } from "@/components/ui-domain/cart-line-recap";
import { SetBadge } from "@/components/ui-domain/set-badge";
import { SavedCartRow } from "@/components/ui-domain/saved-cart-row";
import { SaveForLaterPill } from "@/components/ui-domain/save-for-later-pill";
import {
  CartShippingRow,
  useShippingTotalSuffix,
} from "@/components/ui-domain/cart-shipping-row";
import { useCartContext } from "@/lib/cart/cart-context";
import {
  cartTotal,
  designLabel,
  itemCount,
  lineSubtotal,
  type CartLine,
} from "@/lib/cart/cart";
import { formatMoney } from "@/lib/money/money";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

/** First selection colour of a line → a small identity chip for the row.
 *  The only place a raw DB hex reaches the UI (catalog data, not theme). */
function thumbHex(line: CartLine): string | undefined {
  return line.configSnapshot?.selections.find((s) => s.hex)?.hex ?? undefined;
}

/**
 * CartButton + CartDrawer (F16, DESIGN-SYSTEM §3.12). Lives in the public
 * header next to the locale switch; visible on every page/step. The drawer
 * (shadcn Sheet = Radix Dialog) gives focus-trap, Esc and focus-restore for
 * free. Cart data + mutations come from the shared `useCartContext` (single
 * source: badge, drawer and step 3 stay in sync). No hardcoded colours.
 */
export function CartMenu() {
  const t = useTranslations("cart");
  const to = useTranslations("order");
  const locale = useLocale() as "no" | "en";
  const { cart, hydrated, setQuantity, remove, clear, open, setOpen, saved } =
    useCartContext();
  // drawer has two phases: the cart list and the checkout form
  const [view, setView] = useState<"cart" | "checkout">("cart");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const count = itemCount(cart);
  const totalSuffix = useShippingTotalSuffix(cartTotal(cart));
  // gate count on hydration to avoid SSR/client mismatch (cart starts empty)
  const liveCount = hydrated ? count : 0;

  // R2-6 C: pop the badge when the count GROWS (an item was added) — a mobile
  // cue pointing at the cart. Decorative only; the count is already announced
  // via the aria-live region below, so no new announcement.
  const [pulse, setPulse] = useState(false);
  const prevCount = useRef(0);
  useEffect(() => {
    if (!hydrated) {
      prevCount.current = count;
      return;
    }
    if (count > prevCount.current) {
      setPulse(true);
      const id = setTimeout(() => setPulse(false), 450);
      prevCount.current = count;
      return () => clearTimeout(id);
    }
    prevCount.current = count;
  }, [count, hydrated]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setView("cart"); // reset phase when closing
  }

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>
          <button
            type="button"
            data-testid="cart-button"
            aria-label={t("button", { count: liveCount })}
            aria-haspopup="dialog"
            className="relative -mr-1.5 flex size-11 items-center justify-center rounded-lg text-ink-muted transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <ShoppingBag className="size-5" aria-hidden />
            {hydrated && count > 0 && (
              <span
                data-testid="cart-badge"
                className={cn(
                  "absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums",
                  pulse && "motion-safe:max-md:[animation:cart-pop_0.4s_ease]"
                )}
              >
                {count}
              </span>
            )}
          </button>
        </SheetTrigger>

        <SheetContent
          side="right"
          data-testid="cart-drawer"
          className="w-full! gap-0 p-0 sm:max-w-[380px]!"
        >
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle>{t("cartTitle")}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("description")}
            </SheetDescription>
          </SheetHeader>

          {/* F40: lo slot salvato vive SOPRA le righe correnti e sopravvive al
              carrello vuoto — è da lì che si fa "Hent tilbake" dopo un
              salvataggio (AC1/AC3). Nessun badge nuovo in header: il numerino
              resta del solo carrello attivo. */}
          {view === "cart" && saved.hydrated && (
            // La spaziatura è condizionale, non il blocco: la regione
            // aria-live deve esistere PRIMA che l'avviso compaia (una region
            // creata insieme al suo contenuto non viene annunciata da tutti
            // gli screen reader). Senza slot né avvisi il blocco non occupa
            // spazio e le righe restano attaccate all'header come prima.
            <div
              className={cn(
                "flex flex-col",
                (saved.slot || saved.report || saved.failed || saved.unsupported) &&
                  "gap-2 px-4 pt-4"
              )}
            >
              {saved.slot && (
                <SavedCartRow
                  saved={saved.slot}
                  pending={saved.pending}
                  onRestore={saved.requestRestore}
                />
              )}
              <div aria-live="polite">
                {(saved.report || saved.failed || saved.unsupported) && (
                  <div
                    data-testid="saved-cart-notice"
                    className="rounded-sm border border-primary/40 bg-primary/5 p-2.5 text-xs"
                  >
                    {saved.unsupported && <p>{t("saved.unsupported")}</p>}
                    {saved.failed && <p>{t("saved.failed")}</p>}
                    {saved.report && saved.report.removed.length > 0 && (
                      <p data-testid="saved-cart-removed">
                        {t("saved.removed", { count: saved.report.removed.length })}
                      </p>
                    )}
                    {saved.report && saved.report.adapted.length > 0 && (
                      <p data-testid="saved-cart-adapted">
                        {t("saved.adapted", { count: saved.report.adapted.length })}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={saved.dismissNotice}
                      className="mt-1 flex min-h-11 items-center underline underline-offset-2"
                    >
                      {t("saved.dismiss")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {count === 0 ? (
            <div
              data-testid="cart-empty"
              className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
            >
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
              <SheetClose asChild>
                <Button asChild variant="outline">
                  <Link href="/configurator">{t("emptyCta")}</Link>
                </Button>
              </SheetClose>
            </div>
          ) : view === "cart" ? (
            <>
              <div
                data-testid="cart-list"
                className="flex-1 overflow-y-auto px-4"
              >
                {cart.map((line) => (
                  <div
                    key={line.id}
                    data-testid="cart-line"
                    className="border-b border-border/60 py-3 last:border-0"
                  >
                    <div className="flex gap-3">
                      <CartLineThumb
                        layers={line.layers}
                        hex={thumbHex(line)}
                        plateImage={line.plateImage}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          <span className="truncate">
                            {locale === "no" ? line.productNameNo : line.productNameEn}
                          </span>
                          {/* F29: same set marker as the step-3 docked row
                              (`docked-cart` in ceramics-step.tsx) — the drawer
                              was the last surface still hiding it. */}
                          <SetBadge count={line.pieces ?? 1} className="shrink-0" />
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {designLabel(line.configSnapshot, locale) ?? "—"}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex items-center rounded-sm border border-border">
                            <button
                              type="button"
                              aria-label="-"
                              onClick={() =>
                                setQuantity(line.id, line.quantity - 1)
                              }
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
                              onClick={() =>
                                setQuantity(line.id, line.quantity + 1)
                              }
                              className="flex size-11 items-center justify-center sm:size-9"
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
                      <span className="shrink-0 text-right text-sm font-medium tabular-nums">
                        {formatMoney(lineSubtotal(line), locale)}
                      </span>
                    </div>

                    <div className="mt-2">
                      <button
                        type="button"
                        data-testid="cart-expand"
                        aria-expanded={expandedId === line.id}
                        onClick={() =>
                          setExpandedId((id) => (id === line.id ? null : line.id))
                        }
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        {expandedId === line.id
                          ? `${t("line.collapse")} ▴`
                          : `${t("line.expand")} ▾`}
                      </button>
                      {expandedId === line.id && (
                        <CartLineRecap
                          line={line}
                          locale={locale}
                          editSlot={
                            <SheetClose asChild>
                              <Link
                                href={`/configurator?code=${encodeURIComponent(line.configCode)}&step=2`}
                                data-testid="cart-edit-design"
                                className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                              >
                                ✎ {t("line.edit")}
                              </Link>
                            </SheetClose>
                          }
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <SheetFooter className="border-t border-border">
                <CartShippingRow total={cartTotal(cart)} />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("total")}
                  </span>
                  <span
                    data-testid="cart-total"
                    className="text-lg font-semibold tabular-nums"
                  >
                    {formatMoney(cartTotal(cart), locale)}
                    {totalSuffix}
                  </span>
                </div>
                {/* F40 (mockup 1): "Lagre til senere" sotto le righe e sopra
                    "Send order". Resta dopo il blocco totali: il denaro non si
                    spezza in due — il mockup schematizza il drawer senza la
                    riga spedizione/totale, che qui esiste. */}
                <SaveForLaterPill
                  className="w-full"
                  disabled={saved.pending}
                  onClick={saved.requestSave}
                />
                {/* R-EXTRA AC8: stessa pillola dello stack step 3
                    (`docked-checkout` in ceramics-step.tsx) — il drawer era
                    rimasto l'ultimo punto d'invio ordine col bottone pieno
                    vecchio. Camioncino e non freccia di avanzamento: l'ordine
                    parte, non c'è uno step successivo nel wizard
                    (nota-step3-cart.md). Testid invariato: cart.spec,
                    order.spec, order-email.spec e evidence.spec lo usano. */}
                <NextStepPill
                  data-testid="cart-checkout"
                  className="w-full"
                  caption={t("checkoutKicker")}
                  label={to("title")}
                  arrow
                  icon={
                    <PillIcon>
                      <Truck className="size-5 text-primary" />
                    </PillIcon>
                  }
                  onClick={() => setView("checkout")}
                />
              </SheetFooter>
            </>
          ) : (
            <div className="flex flex-1 flex-col overflow-y-auto p-4">
              <button
                type="button"
                data-testid="cart-back"
                onClick={() => setView("cart")}
                className="mb-3 self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                ← {t("backToCart")}
              </button>
              <OrderForm
                cart={cart}
                onSuccess={() => {
                  clear();
                  setOpen(false);
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* discreet screen-reader announcement of the count */}
      <span aria-live="polite" className="sr-only">
        {hydrated && count > 0 ? t("button", { count }) : ""}
      </span>
    </>
  );
}
