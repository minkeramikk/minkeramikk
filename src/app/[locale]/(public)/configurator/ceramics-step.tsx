"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  HoverPreviewCard,
  useHoverPreview,
  useWarmupPreviews,
} from "@/components/ui-domain/hover-preview";
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
import { encodeSetParam, SET_LINK_BUDGET } from "@/lib/cart/set-code";
import { SetBadge } from "@/components/ui-domain/set-badge";
import type { ResolvedSharedSet } from "./resolve-shared-set";
import { cn } from "@/lib/utils";

export interface CeramicProduct {
  id: string;
  slug: string;
  nameNo: string;
  nameEn: string;
  priceCents: number;
  currency: Currency;
  image: string | null;
  /** F29: pieces in the product. 1 = single item; >1 = set. */
  pieces: number;
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
 * R1-FB4 — step-3 ceramic card with the shared F13 hover/focus preview:
 * bigger product photo + name + price. Desktop-only (hoverCapable inside the
 * hook); on touch "see it bigger" stays with the cart-row expansion (CA-3).
 * The popup reuses the SAME products@256 variant URL as the thumb (F26):
 * browser-cache hit, masters never leave Storage.
 *
 * F33: the card stays a `radio` (tap → selects → shows the preview popup); a
 * separate "+" button quick-adds this product with qty 1. The "+" is a sibling
 * (NOT nested — invalid HTML), absolutely placed over the card; it sits on top
 * (z) so clicking it adds without changing the selection.
 */
function CeramicOptionCard({
  product: p,
  selected,
  locale,
  onSelect,
  onAdd,
}: {
  product: CeramicProduct;
  selected: boolean;
  locale: "no" | "en";
  onSelect: () => void;
  onAdd: () => void;
}) {
  const t = useTranslations("cart");
  const ref = useRef<HTMLButtonElement>(null);
  const { show, hide, ...preview } = useHoverPreview(ref, Boolean(p.image));
  const name = locale === "no" ? p.nameNo : p.nameEn;
  const price = formatMoney(money(p.priceCents, p.currency), locale);

  return (
    <div className="relative snap-start">
      <button
        ref={ref}
        type="button"
        role="radio"
        aria-checked={selected}
        data-testid={`product-${p.slug}`}
        onClick={onSelect}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={[
          "flex min-h-11 w-full flex-col items-center gap-1 rounded-sm border-[1.5px] p-2 text-center transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
          selected
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-ring",
        ].join(" ")}
      >
        {/* F29: set marker on the corner — top-left so it never clashes with
            the "+" quick-add (top-right); readable at 390 */}
        <SetBadge count={p.pieces} className="absolute left-1 top-1 z-10" />
        {p.image && (
          // eslint-disable-next-line @next/next/no-img-element -- catalog art from storage
          <img
            src={assetUrl(p.image)}
            alt=""
            loading="lazy"
            decoding="async"
            data-testid="product-thumb"
            className="h-16 w-16 object-contain"
          />
        )}
        <span className="text-xs font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">{price}</span>
      </button>

      {/* F33: per-card quick-add (qty 1; quantity is edited in the cart). Own
          button with an i18n aria-label; ≥44px touch target on mobile.
          TODO:nb-review — cart.addProduct NO string ("Legg til {name}") is a
          fresh translation. */}
      <button
        type="button"
        data-testid={`add-${p.slug}`}
        aria-label={t("addProduct", { name })}
        onClick={onAdd}
        className="absolute right-1 top-1 z-20 flex size-11 items-center justify-center rounded-full bg-primary text-lg leading-none text-primary-foreground shadow-card transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring sm:size-9"
      >
        +
      </button>

      {p.image && (
        <HoverPreviewCard
          state={{ show, hide, ...preview }}
          testId="product-preview"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- catalog art from storage */}
          <img
            src={assetUrl(p.image)}
            alt={name}
            className="size-44 object-contain"
          />
          <span className="mt-1 block text-center text-xs font-medium">
            {name}
          </span>
          <span className="block text-center text-xs text-muted-foreground">
            {price}
          </span>
          {p.pieces > 1 && (
            <span className="mt-1 flex justify-center">
              <SetBadge count={p.pieces} />
            </span>
          )}
        </HoverPreviewCard>
      )}
    </div>
  );
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
  sharedSet = null,
}: {
  products: CeramicProduct[];
  design: DesignRef;
  snapshot: ConfigSnapshot;
  configCode: string;
  /** F19: composited design layers (no plate); plate prepended at add-time. */
  designLayers: CartLayer[];
  /** CA-3: server-resolved `?set=` lines (live prices), or null when no set. */
  sharedSet?: ResolvedSharedSet | null;
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
  const [justAdded, setJustAdded] = useState(false);
  /** Desktop + mobile inline: expands the order form in the cart panel. */
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /** CA-3 E: id of the one expanded cart row (one at a time), or null. */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** CA-3 C: share feedback under the panel header (aria-live). */
  const [shareState, setShareState] = useState<
    | null
    | { kind: "copied" | "manual"; url: string }
    | { kind: "tooBig" }
    | { kind: "none" }
  >(null);
  /** CA-3 D: landing banner for a `?set=` arrival. */
  const [setBanner, setSetBanner] = useState<
    | null
    | { kind: "choice"; designs: number; unavailable: number }
    | { kind: "loaded"; designs: number; pieces: number; unavailable: number }
  >(null);
  const setConsumedRef = useRef(false);

  // R1-FB2/FB4: warm the ceramic photos in idle (desktop) — covers the
  // lazy-loaded below-the-fold thumbs so the hover popup is instant too.
  const warmupUrls = useMemo(
    () => products.map((p) => (p.image ? assetUrl(p.image) : null)),
    [products]
  );
  useWarmupPreviews(warmupUrls);

  const count = hydrated ? itemCount(cart) : 0;
  const total = cartTotal(cart);

  // F33: desktop needs an explicit affordance to scroll the 2-row strip (a
  // mouse has no horizontal wheel; touch swipes natively). ~2 columns per click.
  const scrollerRef = useRef<HTMLDivElement>(null);
  function scrollCeramics(dir: 1 | -1) {
    scrollerRef.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  }

  // F33: add ANY product (parametrised) keeping the current design context
  // (configCode/snapshot/layers are the same for every ceramic of this design).
  function addProduct(product: CeramicProduct, quantity: number) {
    add({
      productId: product.id,
      productNameNo: product.nameNo,
      productNameEn: product.nameEn,
      supplierId: design.supplierId,
      supplierName: design.supplierName ?? "",
      unitPriceCents: product.priceCents,
      currency: product.currency,
      quantity,
      configCode,
      configSnapshot: snapshot,
      layers: designLayers,
      plateImage: product.image ? assetUrl(product.image) : undefined,
      productSlug: product.slug,
      pieces: product.pieces,
    });
    setJustAdded(true);
  }

  // ── CA-3 C: share the basket as a stateless link (?step=3&set=…) ──
  // TODO:nb-review — the new cart.share.* / cart.sharedSet.* / cart.line.*
  // Norwegian strings in no.json are fresh translations (naming "Share your
  // set" is provisional, dedicated keys so the client rename is cheap).
  /** Legacy rows (pre-CA-3, no productSlug) can't travel in the link. */
  const notShareable = cart.filter((l) => !l.productSlug || !l.configCode).length;

  // NEVER fail silently: every path lands on a visible state — the click must
  // always produce the link on screen, clipboard/native share are a bonus
  // (clipboard throws NotAllowedError in plenty of real contexts).
  //
  // @param preferNative try the OS share sheet first. ONLY the mobile sticky
  //   bar passes true (frame 5): desktop Chrome/Safari also expose
  //   navigator.share, but on desktop the expected gesture is copy-link
  //   (frame 1, ConfigCodeBar pattern), not a system share dialog.
  async function shareSet(preferNative: boolean) {
    const param = encodeSetParam(cart);
    if (!param) {
      // only legacy rows (no productSlug) → nothing can travel in the link
      setShareState({ kind: "none" });
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}?step=3&set=${param}`;
    if (url.length > SET_LINK_BUDGET) {
      // decision 5: silent budget check — overflow is academic, just say so
      setShareState({ kind: "tooBig" });
      return;
    }
    if (preferNative && typeof navigator.share === "function") {
      try {
        await navigator.share({ url });
        return; // the OS share sheet was the feedback
      } catch {
        /* user cancelled or share unsupported for URLs → fall back to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareState({ kind: "copied", url });
    } catch {
      // clipboard blocked → still show the link for manual copy
      setShareState({ kind: "manual", url });
    }
  }

  // ── CA-3 D: landing from a shared link. The server resolved `set=` into
  // ready lines (live prices); here we apply (empty basket) or ask (3-way
  // banner) and consume the param once — same decode-once pattern as ?code=.
  const sharedDesigns = sharedSet
    ? new Set(sharedSet.lines.map((l) => l.configSnapshot?.designSlug)).size
    : 0;
  const sharedPieces = sharedSet
    ? sharedSet.lines.reduce((n, l) => n + l.quantity, 0)
    : 0;

  function consumeSetParam() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("set");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function applySharedSet(mode: "add" | "replace") {
    if (!sharedSet) return;
    if (mode === "replace") clear();
    for (const line of sharedSet.lines) add(line);
    setSetBanner({
      kind: "loaded",
      designs: sharedDesigns,
      pieces: sharedPieces,
      unavailable: sharedSet.unavailable,
    });
    consumeSetParam();
  }

  useEffect(() => {
    if (!sharedSet || !hydrated || setConsumedRef.current) return;
    if (!searchParams.get("set")) return; // already consumed (back/forward)
    setConsumedRef.current = true;
    if (sharedSet.lines.length === 0) {
      // nothing usable survived the parse/resolution — inform and consume
      setSetBanner({
        kind: "loaded",
        designs: 0,
        pieces: 0,
        unavailable: sharedSet.unavailable,
      });
      consumeSetParam();
    } else if (cart.length === 0) {
      applySharedSet("add");
    } else {
      // never overwrite silently: the set stays UNapplied until a choice;
      // `set=` survives a refresh on purpose (the banner must come back)
      setSetBanner({
        kind: "choice",
        designs: sharedDesigns,
        unavailable: sharedSet.unavailable,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot apply on arrival
  }, [sharedSet, hydrated]);

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
    // CA-6b: default scroll (top) on step change, like the steps 1–2 shell.
    router.push(`${pathname}?${params.toString()}`);
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
                    {/* F29: set marker on the cart row (legacy lines lack
                        `pieces` → SetBadge renders nothing) */}
                    <SetBadge count={line.pieces ?? 1} className="shrink-0" />
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {line.configSnapshot?.designName ?? "—"}
                  </p>
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
                <div className="flex shrink-0 flex-col items-end justify-between self-stretch">
                  <span className="text-right text-sm font-medium tabular-nums">
                    {formatMoney(lineSubtotal(line), locale)}
                  </span>
                  {/* CA-3 E: expansion as a LABELLED action (the bare ▾ icon
                      read as decoration) — price top-right, toggle BOTTOM
                      right on the qty/Remove baseline (mb compensates the
                      qty box centring); one row open at a time */}
                  <button
                    type="button"
                    data-testid="cart-expand"
                    aria-expanded={expandedId === line.id}
                    onClick={() =>
                      setExpandedId((id) => (id === line.id ? null : line.id))
                    }
                    className="mb-2.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground max-sm:mb-3.5"
                  >
                    {expandedId === line.id
                      ? `${t("line.collapse")} ▴`
                      : `${t("line.expand")} ▾`}
                  </button>
                </div>
                </div>

                {/* CA-3 E: inline detail (frame 2) — big composition from the
                    line's stored F19 layers (zero fetch), readable selections
                    from the snapshot (R1-FB1 extended to the cart), edit+remove. */}
                {expandedId === line.id && (
                  <div
                    data-testid="cart-line-detail"
                    className="mt-3 flex flex-col gap-3 rounded-sm border border-primary/40 bg-card/55 p-3"
                  >
                    <span
                      aria-hidden
                      className="relative mx-auto block size-52 overflow-hidden rounded-md border border-border bg-card sm:size-56"
                      style={
                        !(line.layers && line.layers.length > 0) && thumbHex(line)
                          ? { backgroundColor: thumbHex(line) }
                          : undefined
                      }
                    >
                      {(line.layers ?? []).map((l, i) => (
                        // eslint-disable-next-line @next/next/no-img-element -- composited catalog art from storage
                        <img
                          key={`${l.src}-${i}`}
                          src={l.src}
                          alt=""
                          className="absolute inset-0 size-full object-contain"
                          style={l.recolor ? { mixBlendMode: "multiply" } : undefined}
                        />
                      ))}
                    </span>
                    {line.configSnapshot && (
                      <dl className="flex flex-col gap-1">
                        {line.configSnapshot.selections.map((s) => (
                          <div
                            key={s.label}
                            className="flex items-center gap-2 text-xs"
                          >
                            {s.hex && (
                              <span
                                aria-hidden
                                className="size-3.5 shrink-0 rounded-full border border-border"
                                style={{ background: s.hex }}
                              />
                            )}
                            <dt className="text-muted-foreground">
                              {locale === "no" ? s.label : (s.labelEn ?? s.label)}
                            </dt>
                            <dd className="font-medium">{s.option}</dd>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 text-xs">
                          <dt className="text-muted-foreground">
                            {t("line.ceramic")}
                          </dt>
                          <dd className="flex items-center gap-1.5 font-medium">
                            {locale === "no"
                              ? line.productNameNo
                              : line.productNameEn}
                            <SetBadge count={line.pieces ?? 1} />
                          </dd>
                        </div>
                      </dl>
                    )}
                    {/* bottom action row: config code + copy on the left
                        (moved here from the compact row for a cleaner closed
                        line — design decision 2026-06-16), Edit design on the
                        right. No second Remove — the row above already has one */}
                    <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2.5">
                      {line.configCode ? (
                        <div className="flex min-w-0 items-center gap-2">
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
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        data-testid="cart-edit-design"
                        onClick={() =>
                          router.push(
                            `/configurator?code=${encodeURIComponent(line.configCode)}&step=2`
                          )
                        }
                        className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        ✎ {t("line.edit")}
                      </button>
                    </div>
                  </div>
                )}
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
              <>
                <Button
                  size="lg"
                  className="min-h-11 w-full"
                  data-testid="docked-checkout"
                  onClick={() => setCheckoutOpen(true)}
                >
                  {to("title")}
                </Button>
                {/* CA-3: share under Send order (Alessio) — light gesture,
                    ConfigCodeBar pattern */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="share-set"
                  onClick={() => shareSet(false)}
                >
                  ⤴ {t("share.button")}
                </Button>
                {/* share feedback: announced, link visible (frame 1) */}
                <div aria-live="polite">
                  {shareState && (
                    <div
                      data-testid="share-feedback"
                      className="rounded-sm border border-primary/40 bg-primary/5 p-2.5 text-xs"
                    >
                      {shareState.kind === "tooBig" ? (
                        <p>{t("share.tooBig")}</p>
                      ) : shareState.kind === "none" ? null : (
                        <>
                          <p className="font-medium">
                            {shareState.kind === "copied"
                              ? t("share.copied")
                              : t("share.manual")}
                          </p>
                          <code
                            className={cn(
                              "mt-1 block select-all font-mono text-[10px] text-muted-foreground",
                              // manual copy needs the WHOLE link visible
                              shareState.kind === "manual"
                                ? "break-all"
                                : "truncate"
                            )}
                          >
                            {shareState.url}
                          </code>
                        </>
                      )}
                      {notShareable > 0 && (
                        <p
                          data-testid="share-not-shareable"
                          className="mt-1 text-muted-foreground"
                        >
                          {t("share.notShareable", { count: notShareable })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div data-testid="ceramics-step">
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

      {/* CA-3 D: shared-set landing banner (frames 3–4). The 3-way choice
          never applies the set silently; `set=` is consumed after auto-load
          or after the choice (decode-once, like ?code=). */}
      {setBanner && (
        <div
          data-testid="shared-set-banner"
          aria-live="polite"
          className="mb-4 flex flex-col gap-2.5 rounded-sm border border-primary/50 bg-primary/5 p-3.5"
        >
          <p className="text-sm">
            <span className="mr-2 rounded-full border border-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-primary">
              {t("sharedSet.badge")}
            </span>
            {setBanner.kind === "choice" ? (
              <span data-testid="shared-set-choice-text">
                {t("sharedSet.choiceTitle", {
                  designs: setBanner.designs,
                  items: count,
                })}
              </span>
            ) : (
              setBanner.pieces > 0 && (
                <span data-testid="shared-set-loaded-text">
                  {t("sharedSet.loaded", {
                    designs: setBanner.designs,
                    pieces: setBanner.pieces,
                  })}
                </span>
              )
            )}
          </p>
          {setBanner.unavailable > 0 && (
            <p
              data-testid="shared-set-unavailable"
              className="text-xs text-muted-foreground"
            >
              {t("sharedSet.unavailable", { count: setBanner.unavailable })}
            </p>
          )}
          {setBanner.kind === "choice" && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                data-testid="shared-set-add"
                onClick={() => applySharedSet("add")}
              >
                {t("sharedSet.add")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="shared-set-replace"
                onClick={() => applySharedSet("replace")}
              >
                {t("sharedSet.replace")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="shared-set-ignore"
                onClick={() => {
                  setSetBanner(null);
                  consumeSetParam();
                }}
              >
                {t("sharedSet.ignore")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* No fixed mobile action bar on step 3 (client, 2026-06-12): the
          inline cart panel below already carries the total + Send + share,
          and the stepper above handles navigation. The old sticky summary
          bar read as a stray "action footer" on mobile. */}

      {/* F21: two-column grid on desktop; single column + stacked cart on mobile */}
      <div className="grid grid-cols-1 items-start gap-7 md:grid-cols-2">
        {/* LEFT: ceramic selector */}
        <div className="flex min-w-0 flex-col">
          <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {tc("stepIndicator", { step: 3 })}
          </p>
          <div className="mb-4 mt-1 flex items-center gap-2">
            <h2 className="text-xl font-semibold">{t("title")}</h2>
            {/* F33: desktop scroll arrows — touch scrolls natively (no arrows).
                TODO:nb-review — cart.scrollPrev/scrollNext NO strings are fresh. */}
            <span className="ml-auto flex gap-1.5 max-md:hidden">
              <button
                type="button"
                aria-label={t("scrollPrev")}
                data-testid="ceramics-scroll-prev"
                onClick={() => scrollCeramics(-1)}
                className="flex size-8 items-center justify-center rounded-full border border-border bg-card text-sm hover:border-ring"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label={t("scrollNext")}
                data-testid="ceramics-scroll-next"
                onClick={() => scrollCeramics(1)}
                className="flex size-8 items-center justify-center rounded-full border border-border bg-card text-sm hover:border-ring"
              >
                ›
              </button>
            </span>
          </div>

          {/* F33: horizontal 2-row scroller (FeaturedStrip pattern) — ~6
              products visible on desktop, ~4–5 + peek on mobile, instead of a
              very tall radio grid with 28 items. Fixed 150px columns flow
              top→bottom then across; right peek via mask; snap + overlay scroll
              so it never reflows the layout. */}
          <div
            ref={scrollerRef}
            role="radiogroup"
            aria-label={t("title")}
            className="grid grid-flow-col grid-rows-2 auto-cols-[150px] gap-2.5 overflow-x-auto overscroll-x-contain pb-1 snap-x snap-mandatory [mask-image:linear-gradient(to_right,black_92%,transparent)] [-webkit-mask-image:linear-gradient(to_right,black_92%,transparent)]"
          >
            {products.map((p) => (
              <CeramicOptionCard
                key={p.id}
                product={p}
                selected={p.id === selectedId}
                locale={locale}
                onSelect={() => setSelectedId(p.id)}
                onAdd={() => addProduct(p, 1)}
              />
            ))}
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
