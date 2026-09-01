import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { CartLineThumb } from "@/components/ui-domain/cart-line-thumb";
import { resolveSetPreviews } from "@/lib/orders/set-preview";
import { getVippsSettings } from "@/lib/orders/vipps.server";
import { hasVippsDetails } from "@/lib/orders/vipps";
import { shippingStatus } from "@/lib/cart/shipping";
import {
  formatMoney,
  money,
  subtract,
  sum,
  type Currency,
  type Money,
} from "@/lib/money/money";
import { assetUrl } from "@/lib/storage";
import { siteUrl } from "@/lib/site";
import { OrderShareButton } from "./share-button";
import { CopyValue } from "./copy-code";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("order");
  return { title: t("confirmTitle") };
}

type Params = Promise<{ locale: string }>;
type SearchParams = Promise<{ code?: string; set?: string; total?: string }>;

/** `total=` is minor units, written by the order form from the SERVER's figure. */
const TOTAL_RE = /^\d{1,9}$/;

/**
 * Order confirmation — the "takk-side" (F05 + F30-B + R4-TAKK).
 *
 * ⚠️ THIS PAGE DOES NOT ASK FOR MONEY (TL ruling, 2026-08-30). The customer
 * does pay now — one payment, by hand over Vipps, right after the order — but
 * the design is not confirmed yet and the final price can still change, so a
 * "pay now" button here would collect against a figure that may move and turn
 * every design change into a refund. The page INFORMS: how much, how to pay,
 * what happens next. Hence «Totalt for bestillingen» (not «Å betale»), «Slik
 * betaler du» (not «Betal med Vipps»), and QR + number as DATA, never a CTA.
 *
 * Still stateless: it never reads the orders table. The code and the total come
 * from the URL, the recap is recomposed from the CA-3 `set=` param against the
 * public catalog, and the Vipps details come from `settings`. Degrades cleanly
 * at every step: no Vipps settings → the payment block disappears whole and the
 * page still reads complete; no `set=` → code and total only; no `code=` →
 * empty state.
 *
 * TODO:nb-review — most Norwegian copy here is the TL's own (mockup-takk.html,
 * the four journey steps from mockup-mail-stepper.html);
 * `order.shippingToBeConfirmed`, `order.discountLabel`, `order.payment.qrAlt`,
 * `order.payment.lookupHint` and `order.payment.lead` are ours and want the
 * client's eye.
 */
export default async function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { locale: rawLocale } = await params;
  const { code, set, total } = await searchParams;
  const locale = rawLocale === "no" ? "no" : "en";
  const t = await getTranslations("order");
  const ta = await getTranslations("actions");
  const tc = await getTranslations("common");

  if (!code) {
    return (
      <section className="mx-auto max-w-xl py-20 text-center">
        <h1 className="text-2xl font-semibold">{t("emptyTitle")}</h1>
        <p className="mt-3 text-muted-foreground">{t("emptyBody")}</p>
        <Button asChild className="mt-6 rounded-mk px-8">
          <Link href="/configurator">{ta("newDesign")}</Link>
        </Button>
      </section>
    );
  }

  const [lines, vipps] = await Promise.all([
    resolveSetPreviews(set, locale),
    getVippsSettings(),
  ]);

  // Money. The `set=` param carries codes/slugs/quantities only (CA-3), so the
  // lines re-price at the LIVE catalogue price — full price, no deal rules. The
  // authoritative net total therefore travels separately, computed by the
  // server at order creation; the gap between the two IS the discount, so the
  // page never re-runs the engine and can never disagree with the email.
  const currency: Currency = lines[0]?.price.currency ?? "NOK";
  const subtotal = sum(
    lines.map((l) => l.price),
    currency
  );
  // NO fallback to the subtotal: on a discounted order that would quote the
  // gross and tell the customer to send MORE than he owes over Vipps, which is
  // the one thing this page exists to get right. Without a valid `total=` the
  // figure is simply not shown — the email stays the document that carries it.
  const netTotal: Money | null = TOTAL_RE.test(total ?? "")
    ? money(Number(total), currency)
    : null;
  const saved = netTotal ? subtract(subtotal, netTotal) : money(0, currency);
  const discounted = saved.amountCents > 0;

  // CA-3 landing convention: ?step=3&set=… (set= is only resolved on step 3).
  const shareUrl = set
    ? `${siteUrl()}/${locale}/configurator?step=3&set=${set}`
    : null;

  const steps = [
    { key: "received", done: true },
    { key: "paid", done: false },
    { key: "production", done: false },
    { key: "shipped", done: false },
  ] as const;

  return (
    <section
      className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-12"
      data-testid="order-confirmation"
    >
      {/* ① confirmation */}
      <div className="flex flex-col items-center gap-2 text-center">
        <span
          aria-hidden
          className="grid size-12 place-items-center rounded-full text-xl"
          style={{
            background: "color-mix(in oklab, var(--discount) 22%, white)",
            color: "color-mix(in oklab, var(--discount), black 34%)",
          }}
        >
          ✓
        </span>
        <h1 className="font-heading text-2xl">{t("confirmTitle")}</h1>
        <p className="max-w-[34ch] text-sm text-muted-foreground">
          {t("confirmLead")}
        </p>
      </div>

      {/* ② order number + total — the two facts the customer needs in hand
          when he opens Vipps. Same size: neither outranks the other. */}
      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
        <div className="bg-card px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.07em] text-muted-foreground">
            {t("codeLabel")}
          </p>
          <p
            className="mt-0.5 text-[27px] font-semibold tabular-nums"
            data-testid="order-code"
          >
            {code}
          </p>
          <CopyValue value={code} testId="order-copy-code" className="-mb-2" />
        </div>
        {netTotal && (
          <div className="bg-card px-4 py-4" data-testid="order-total">
            <p className="text-[11px] uppercase tracking-[0.07em] text-muted-foreground">
              {t("totalLabel")}
            </p>
            <p className="mt-0.5 text-[27px] font-semibold tabular-nums">
              {formatMoney(netTotal, locale)}
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              {shippingStatus(netTotal).included
                ? t("shippingIncluded")
                : t("shippingToBeConfirmed")}
            </p>
          </div>
        )}
      </div>

      {/* ③ how to pay — hidden WHOLE when nothing is configured (AC2) */}
      {hasVippsDetails(vipps) && (
        <div
          className="rounded-lg border border-border bg-card p-4"
          data-testid="order-payment"
        >
          <h2 className="text-[15px] font-semibold">{t("payment.title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("payment.lead")}</p>

          {/* Below sm the QR is useless — you cannot scan a code shown by the
              phone you are holding — so the NUMBER leads and the QR follows,
              smaller, with a hint that says to look the number up. From sm up
              the QR leads and is scanned by a phone. Same markup, `order-*`. */}
          <div className="mt-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            {vipps.qrImage && (
              // eslint-disable-next-line @next/next/no-img-element -- shop-uploaded asset from storage
              <img
                src={assetUrl(vipps.qrImage)}
                alt={t("payment.qrAlt")}
                width={118}
                height={118}
                className="order-2 size-[92px] shrink-0 self-start rounded-md border border-border bg-white object-contain p-1 sm:order-1 sm:size-[118px] sm:self-auto"
                data-testid="order-vipps-qr"
              />
            )}
            <div className="order-1 flex min-w-0 flex-col gap-0.5 sm:order-2">
              {vipps.number && (
                <>
                  <span className="text-[11px] uppercase tracking-[0.07em] text-muted-foreground">
                    {t("payment.numberLabel")}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-4">
                    <b
                      className="text-[26px] font-semibold tabular-nums"
                      data-testid="order-vipps-number"
                    >
                      {vipps.number}
                    </b>
                    <CopyValue
                      value={vipps.number}
                      testId="order-copy-vipps"
                      className="sm:hidden"
                    />
                  </span>
                </>
              )}
              <span className="text-xs text-muted-foreground">
                {t("payment.recipient")}
              </span>
              {vipps.number && (
                <span className="mt-1 text-xs text-muted-foreground sm:hidden">
                  {t("payment.lookupHint")}
                </span>
              )}
              {vipps.qrImage && (
                <span className="mt-1 hidden text-xs text-muted-foreground sm:block">
                  {t("payment.scanHint")}
                </span>
              )}
            </div>
          </div>

          {/* The single point where a manual payment actually breaks: a payment
              with no order number in the message is money the shop cannot
              attribute. It is a coloured box INSIDE the payment block, not a
              line of small print — do not demote it for looks. */}
          <div
            className="mt-3.5 rounded-md border p-3.5"
            data-testid="order-vipps-melding"
            style={{
              background: "color-mix(in oklab, var(--warn) 12%, white)",
              borderColor: "color-mix(in oklab, var(--warn) 34%, white)",
            }}
          >
            <p
              className="text-xs"
              style={{ color: "color-mix(in oklab, var(--warn), black 30%)" }}
            >
              <b className="font-semibold">{t("payment.warningLabel")}</b>{" "}
              {t("payment.warning")}
            </p>
            <span
              className="mt-2 inline-block rounded-sm border border-dashed bg-white px-2.5 py-0.5 font-semibold tabular-nums text-foreground"
              style={{ borderColor: "color-mix(in oklab, var(--warn) 46%, white)" }}
            >
              {code}
            </span>
          </div>
        </div>
      )}

      {/* ④ what happens now */}
      <div className="rounded-lg border border-border bg-card p-4" data-testid="order-steps">
        <h2 className="mb-3.5 text-[15px] font-semibold">{t("steps.title")}</h2>
        {steps.map((s, i) => (
          <div key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className="absolute left-[9px] top-[22px] bottom-0.5 w-0.5 bg-border"
              />
            )}
            <span
              aria-hidden
              className="z-[1] grid size-5 shrink-0 place-items-center rounded-full border-2 border-border bg-background text-[10px]"
              style={
                s.done
                  ? {
                      background: "var(--discount)",
                      borderColor: "var(--discount)",
                      color: "white",
                    }
                  : undefined
              }
            >
              {s.done ? "✓" : ""}
            </span>
            <span>
              <b className="block text-[13.5px] font-medium">
                {t(`steps.${s.key}Title`)}
              </b>
              <span className="text-xs text-muted-foreground">
                {t(`steps.${s.key}Desc`)}
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* ⑤ recap */}
      {lines.length > 0 && (
        <div
          className="rounded-lg border border-border bg-card p-4"
          data-testid="order-recap"
        >
          <h2 className="mb-2.5 text-[13px] uppercase tracking-[0.06em] text-muted-foreground">
            {t("recapTitle")}
          </h2>
          <ul>
            {lines.map((l, i) => (
              <li
                key={i}
                data-testid="order-recap-line"
                className="flex items-center gap-2.5 border-b border-border py-2 last:border-0"
              >
                <CartLineThumb
                  compact
                  layers={l.layers.length > 0 ? l.layers : undefined}
                  plateImage={l.plateImage ?? undefined}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {l.qty}× {l.productName}
                  </p>
                  {l.designName && (
                    <p className="truncate text-[11.5px] text-muted-foreground">
                      {l.designName}
                    </p>
                  )}
                </div>
                <span className="text-xs tabular-nums">
                  {formatMoney(l.price, locale)}
                </span>
              </li>
            ))}
          </ul>
          {/* The lines re-price at full catalogue price; the net total is the
              server's. When they differ, the gap is named rather than silently
              swallowed — otherwise the rows would not add up to the total.
              Known and accepted (TL, 2026-08-31): the gap is DERIVED, so a
              catalogue price edited after the order would invent a discount
              that never existed, and a product that no longer resolves makes it
              go negative — the row then hides itself and the rows quietly stop
              summing to the total. The page lives for seconds and the email is
              the document; not worth a snapshot to fix. */}
          {discounted && (
            <div
              className="mt-2.5 flex justify-between text-xs"
              data-testid="order-recap-discount"
              style={{ color: "color-mix(in oklab, var(--discount), black 34%)" }}
            >
              <span>{t("discountLabel")}</span>
              <span className="tabular-nums">−{formatMoney(saved, locale)}</span>
            </div>
          )}
          {netTotal && (
            <div className="mt-2.5 flex justify-between border-t border-border pt-2.5 text-sm font-semibold tabular-nums">
              <span>{t("recapTotal")}</span>
              <span data-testid="order-recap-total">
                {formatMoney(netTotal, locale)}
              </span>
            </div>
          )}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {t("contactQuestion")}
        <br />
        <a
          href={`mailto:${tc("email")}`}
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          {tc("email")}
        </a>
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        {shareUrl && <OrderShareButton url={shareUrl} />}
        <Button asChild variant="outline" className="rounded-mk px-8">
          <Link href="/configurator">{ta("newDesign")}</Link>
        </Button>
      </div>
    </section>
  );
}
