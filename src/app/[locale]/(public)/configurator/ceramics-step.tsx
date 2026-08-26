"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Stepper } from "@/components/ui-domain/stepper";
import { DesignRound } from "@/components/ui-domain/design-round";
import { CartLineThumb } from "@/components/ui-domain/cart-line-thumb";
import { OrderForm } from "@/components/ui-domain/order-form";
import { Button } from "@/components/ui/button";
import { assetUrl } from "@/lib/storage";
import { formatMoney, money } from "@/lib/money/money";
import type { Currency } from "@/lib/money/money";
import { useCartContext } from "@/lib/cart/cart-context";
import {
  cartPieces,
  cartTotal,
  designLabel,
  itemCount,
  lineSubtotal,
  type CartLine,
  type CartLayer,
  type ConfigSnapshot,
} from "@/lib/cart/cart";
import { encodeSetParam, SET_LINK_BUDGET } from "@/lib/cart/set-code";
import { SetBadge } from "@/components/ui-domain/set-badge";
import { CartLineRecap } from "@/components/ui-domain/cart-line-recap";
import {
  CartShippingRow,
  useShippingTotalSuffix,
} from "@/components/ui-domain/cart-shipping-row";
import {
  formatAttributeValue,
  publicAttributes,
  type TypedAttribute,
} from "@/lib/catalog/product-attributes";
import { groupBySeries } from "@/lib/configurator/product-series";
import { formatSelections } from "@/lib/configurator/readable-selections";
import { Truck, Plus, ArrowUpRight } from "lucide-react";
import type { ResolvedSharedSet } from "./resolve-shared-set";
import { ProductSheet } from "@/components/ui-domain/product-sheet";
import { NextStepPill, PillIcon } from "@/components/ui-domain/next-step-pill";

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
  descriptionNo: string | null;
  descriptionEn: string | null;
  attributes: TypedAttribute[];
  /** R4-STEP3: up to 2 gallery photos (ADR 0020); [] until admin uploads them. */
  photos: string[];
  /** R4-STEP3: step-3 grid group heading; null = ungrouped. */
  seriesNo: string | null;
  seriesEn: string | null;
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
 * §3.18 CeramicCard (R4-STEP3) — photo-led step-3 card. The whole card is one
 * button: click/tap opens `ProductSheet` (§3.19). Replaces the R2-3-4 compact
 * card that expanded in place, and drops the F13 hover preview with it — the
 * card's own photo IS the preview.
 */
function CeramicCard({
  product: p,
  locale,
  onOpen,
}: {
  product: CeramicProduct;
  locale: "no" | "en";
  onOpen: () => void;
}) {
  const t = useTranslations("configurator");
  const name = locale === "no" ? p.nameNo : p.nameEn;
  const price = formatMoney(money(p.priceCents, p.currency), locale);
  // The real photo when the admin uploaded one, else the catalogue thumb.
  const cover = p.photos[0] ?? p.image;
  // Dimensional attributes only — a `custom` one (e.g. colour) has no unit and
  // would print as a bare, unlabelled value here.
  const size = publicAttributes(p.attributes).find((a) => a.key !== "custom");
  // §3.18 meta: "measure · handmade set" — either half may be missing.
  const meta = [
    size ? formatAttributeValue(size, locale) : null,
    p.pieces > 1 ? t("step3.handmadeSet") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      data-testid={`product-${p.slug}`}
      onClick={onOpen}
      className={[
        "group relative flex w-full flex-col overflow-hidden rounded-lg border-[1.5px] border-border bg-card text-left shadow-(--shadow-card)",
        "transition-[border-color,transform] hover:-translate-y-px hover:border-primary",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
      ].join(" ")}
    >
      {cover && (
        <span className="relative block aspect-square w-full overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- catalog art from storage */}
          <img
            src={assetUrl(cover)}
            alt=""
            loading="lazy"
            decoding="async"
            data-testid="product-thumb"
            className="absolute inset-0 size-full object-cover"
          />
          <SetBadge count={p.pieces} className="absolute left-2 top-2 z-10" />
        </span>
      )}
      {/* §3.18: asymmetric info block (10px 12px 11px in the mockup) */}
      <span className="flex flex-col gap-0.5 px-3 pb-[11px] pt-2.5">
        <span className="text-sm font-semibold leading-tight">{name}</span>
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
        <span className="mt-0.5 text-sm font-semibold tabular-nums">{price}</span>
      </span>
    </button>
  );
}

/**
 * Step 3 — two-panel layout (F21).
 *
 * Desktop (≥768): left = ceramic selector; right = docked inline cart always
 * visible (NOT the Sheet overlay). Adding a product appends a row in the right
 * panel with no overlay interruption.
 *
 * Mobile: stacked — selector first, then the cart rows. R4-CTA-STICKY adds a
 * fixed order bar at the bottom edge («Din bestilling · N deler» + total +
 * «Bestill»), shown only with a non-empty basket and no product sheet open; its
 * CTA scrolls to that cart block rather than opening the form itself.
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
  hasExplicitDesign,
  selections = {},
  sharedSet = null,
}: {
  products: CeramicProduct[];
  design: DesignRef;
  snapshot: ConfigSnapshot;
  configCode: string;
  /** F19: composited design layers (no plate); plate prepended at add-time. */
  designLayers: CartLayer[];
  /**
   * Did the customer actually choose this design (`?design=`), or is it the
   * page's positional fallback? A `?set=` / featured-set landing arrives with
   * no choice at all, and the fallback must never be shown back as "your
   * selection".
   */
  hasExplicitDesign: boolean;
  /**
   * categorySlug → optionId of the config this step is rendering. Only used to
   * pin the colours in the URL when a set landing consumes `set=`; the normal
   * flow already carries them as `opt_*`.
   */
  selections?: Record<string, string>;
  /** CA-3: server-resolved `?set=` lines (live prices), or null when no set. */
  sharedSet?: ResolvedSharedSet | null;
}) {
  const t = useTranslations("cart");
  // TODO:nb-review NO copy: step3.seriesCount · stickyBar.title · stickyBar.pieces
  const tc = useTranslations("configurator");
  const to = useTranslations("order");
  const ta = useTranslations("actions");
  const locale = useLocale() as "no" | "en";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { cart, hydrated, add, setQuantity, remove, clear } = useCartContext();

  /**
   * R4-STEP3: id of the product whose `ProductSheet` is OPEN — no preselection
   * any more (nothing is selected until the customer opens a card). It is not
   * cleared on close: `sheetOpen` drives Radix, so the product lingers through
   * the exit animation instead of unmounting mid-transition.
   */
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /**
   * Same value, readable synchronously. `addOpened` guards on it because state
   * does not update inside a React batch: clicks fired in one tick would all
   * still see `sheetOpen === true`. Always written through `setSheet`.
   */
  const sheetOpenRef = useRef(false);
  function setSheet(open: boolean) {
    sheetOpenRef.current = open;
    setSheetOpen(open);
  }
  /** §3.20: "added to basket" pill, auto-dismissed after ~1.8s. */
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [qty, setQty] = useState(1);
  /** Desktop + mobile inline: expands the order form in the cart panel. */
  const [checkoutOpen, setCheckoutOpen] = useState(false);
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

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  const opened = products.find((p) => p.id === openId) ?? null;

  // Focus restore on close lives in `ProductSheet` (§3.19 is its contract).

  function openProduct(id: string) {
    setOpenId(id);
    setSheet(true);
    setQty(1);
  }

  // F37: current-config recap data (name + readable selections). Rendered only
  // when there are design layers (AC4: no config / ?set= landing → nothing).
  // ponytail: the box (and its "Edit colours ›") exists only for a REAL
  // choice — no explicit design ⇒ no box, not an empty one. The grid below
  // still works off the fallback design, which is fine as a catalog view.
  const hasConfig = hasExplicitDesign && designLayers.length > 0;
  const designName = designLabel(snapshot, locale) ?? "";

  const count = hydrated ? itemCount(cart) : 0;
  /** R4-CTA-STICKY: the bar counts PIECES, not lines — a set is N deler. */
  const pieces = hydrated ? cartPieces(cart) : 0;
  /** The mobile order block — the sticky bar's CTA queries the form inside it. */
  const orderBlockRef = useRef<HTMLDivElement>(null);
  /**
   * R4-CTA-STICKY (giro garanzia): zero-height marker at the END of the mobile
   * order block. Watching the block ITSELF would be wrong — it is ~500px tall
   * and its top edge arrives long before the order CTA does, so the bar would
   * vanish while the button it duplicates is still half a screen down. The end
   * marker fires exactly when that button is on screen, which is the real rule:
   * never two «Bestill» at once.
   */
  const orderEndRef = useRef<HTMLDivElement>(null);
  const [orderCtaInView, setOrderCtaInView] = useState(false);
  useEffect(() => {
    const el = orderEndRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // Two observers, not one: the show boundary sits 80px BELOW the hide
    // boundary, so a pixel of scroll jitter at the edge cannot flip the bar on
    // and off. `when` is the edge each observer owns — the -120px one only ever
    // hides, the -40px one only ever shows; between them nothing changes.
    // Room stays reserved either way (`showStickyBar` keeps the padding), so
    // toggling the bar never reflows the page — the other, worse flicker source.
    const watch = (inset: number, when: boolean) => {
      const io = new IntersectionObserver(
        ([e]) => {
          if (e.isIntersecting === when) setOrderCtaInView(when);
        },
        { rootMargin: `0px 0px -${inset}px 0px` }
      );
      io.observe(el);
      return io;
    };
    const ios = [watch(120, true), watch(40, false)];
    return () => ios.forEach((io) => io.disconnect());
  }, []);
  const total = cartTotal(cart);
  const totalSuffix = useShippingTotalSuffix(total);

  function addSelected() {
    const selected = opened;
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
      productSlug: selected.slug,
      pieces: selected.pieces,
    });
    setQty(1);
  }

  /** §3.20: add → close the sheet FIRST, then show the toast. */
  function addOpened() {
    // The sheet stays mounted (and its CTA clickable) through the 180-220ms
    // exit animation: without this a double-tap would add the product twice.
    if (!sheetOpenRef.current) return;
    addSelected();
    setSheet(false);
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), 1800);
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
    // Pin the landing's design before `set=` goes away, or the next server
    // render falls back to the positional default design and the ceramics
    // grid swaps to ANOTHER design's list (bug 4: the fix on the server side
    // only survives while `set=` is in the URL).
    // `origin=set` keeps this apart from a real colour choice: the design is
    // current, but nothing was configured, so the "Your selection" box must
    // stay away (bug 3). Two states, two params — one flag would trade one
    // bug for the other.
    if (!params.get("design")) {
      params.set("design", design.slug);
      params.set("origin", "set");
      // ...with the set's own colours, not the design's defaults: a ceramic
      // added right after the landing must match the set the customer opened.
      for (const [slug, optionId] of Object.entries(selections)) {
        params.set(`opt_${slug}`, optionId);
      }
    }
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

  // §3.18: sections in the admin's own order; the ungrouped bucket comes last
  // with NO heading.
  const sections = useMemo(() => groupBySeries(products, locale), [products, locale]);

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
                    {designLabel(line.configSnapshot, locale) ?? "—"}
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
                  <CartLineRecap
                    line={line}
                    locale={locale}
                    editSlot={
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
                    }
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
            <CartShippingRow total={total} />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("total")}</span>
              <span
                data-testid="docked-total"
                className="text-lg font-semibold tabular-nums"
              >
                {formatMoney(total, locale)}
                {totalSuffix}
              </span>
            </div>

            {checkoutOpen ? (
              // scroll-mt: the mobile header is sticky and 56px tall, so a
              // bare scrollIntoView would park the form's first rows under it.
              <div data-testid="docked-checkout-form" className="scroll-mt-[4.5rem]">
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
                {/* R-EXTRA: lo stack usa la stessa pillola degli step 1/2
                    (DESIGN-SYSTEM §3.16). Solo "Send bestilling" ha la
                    freccetta e il riempimento: gli altri due non fanno avanzare
                    il funnel (uno riavvia il flusso, l'altro è collaterale).
                    R3-C (final): "Bygg et nytt design" resta l'UNICO punto da
                    cui si ricomincia, e tiene il carrello (F03/F16). */}
                {/* Camioncino, non freccia: l'ordine parte: non c'è uno step
                    successivo nel wizard (nota-step3-cart.md). */}
                <NextStepPill
                  data-testid="docked-checkout"
                  className="w-full"
                  caption={t("checkoutKicker")}
                  label={to("title")}
                  arrow
                  icon={
                    <PillIcon>
                      <Truck className="size-5 text-primary" />
                    </PillIcon>
                  }
                  onClick={() => setCheckoutOpen(true)}
                />
                <NextStepPill
                  variant="secondary"
                  data-testid="new-design-cta"
                  className="w-full"
                  label={ta("newDesign")}
                  icon={
                    <PillIcon variant="secondary">
                      <Plus className="size-5 text-primary/60" />
                    </PillIcon>
                  }
                  onClick={() => goToStep(1)}
                />
                {/* CA-3: share in coda — gesto leggero, quindi la variante
                    più tenue della scala. */}
                <NextStepPill
                  variant="tertiary"
                  data-testid="share-set"
                  className="w-full"
                  label={t("share.button")}
                  icon={
                    <PillIcon variant="tertiary">
                      <ArrowUpRight className="size-5 text-muted-foreground" />
                    </PillIcon>
                  }
                  onClick={() => shareSet(false)}
                />
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
                          {/* Only show the raw URL when the clipboard failed
                              (manual copy needs the whole link visible). On
                              success the bare link looked ugly → hide it. */}
                          {shareState.kind === "manual" && (
                            <code className="mt-1 block select-all font-mono text-[10px] break-all text-muted-foreground">
                              {shareState.url}
                            </code>
                          )}
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

  // F37 ①: desktop "Ditt valg" — sits ABOVE the cart in the sticky column,
  // visually SEPARATE from it (accent left border). Present even with an empty
  // basket. "Endre farger" returns to step 2 keeping the config (goToStep).
  const yourSelectionBox = hasConfig && (
    <div
      data-testid="step3-your-selection"
      className="mb-4 flex items-center gap-3.5 rounded-sm border border-border border-l-4 border-l-primary bg-card p-4"
    >
      <DesignRound layers={designLayers} className="size-14" />
      <div className="min-w-0">
        <p className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
          {tc("yourSelection.kicker")}
        </p>
        <p className="truncate text-sm font-semibold">{designName}</p>
        <p className="text-xs text-muted-foreground">
          {formatSelections(snapshot.selections, locale, { withLabels: true })}
        </p>
      </div>
      <button
        type="button"
        data-testid="your-selection-edit"
        onClick={() => goToStep(2)}
        className="ml-auto flex min-h-11 shrink-0 items-center text-xs font-semibold text-primary hover:underline"
      >
        {tc("yourSelection.edit")} ›
      </button>
    </div>
  );

  // F37 ①: mobile strip — compact, IN-FLOW (never fixed), an entry-point anchor
  // under the title. Options abbreviated (no labels). Scrolls away with content.
  const yourSelectionStrip = hasConfig && (
    <div
      data-testid="step3-your-selection-strip"
      className="mb-3.5 flex items-center gap-2.5 rounded-sm border border-border border-l-[3px] border-l-primary bg-card px-3 py-1.5 md:hidden"
    >
      <DesignRound layers={designLayers} className="size-9" />
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold">{designName}</p>
        <p className="truncate text-[10.5px] text-muted-foreground">
          {formatSelections(snapshot.selections, locale)}
        </p>
      </div>
      <button
        type="button"
        data-testid="your-selection-edit-mobile"
        onClick={() => goToStep(2)}
        className="ml-auto flex min-h-11 shrink-0 items-center text-[11.5px] font-semibold text-primary hover:underline"
      >
        {tc("yourSelection.editShort")} ›
      </button>
    </div>
  );

  // ── R4-CTA-STICKY: mobile order bar ──────────────────────────────────────
  // Self-gates on THREE things, all required by the card: mobile only
  // (`md:hidden`), a non-empty basket, and no product sheet open — two fixed
  // layers at the bottom edge would stack. `count` already folds in `hydrated`,
  // so the bar never flashes in before the cart is read from localStorage.
  // Giro garanzia adds two more reasons to stand down, both the same rule —
  // never a second order CTA on screen: the form is open (the bar's own
  // destination, and a fixed bar sitting on the fields while the keyboard is up
  // is worse than useless), or the panel's CTA has scrolled into view.
  const showStickyBar = count > 0 && !sheetOpen;
  const stickyBar = showStickyBar && !checkoutOpen && !orderCtaInView && (
    <div
      data-testid="step3-sticky-bar"
      // z-40: under Radix's overlay/content (z-50), so the sheet and the
      // lightbox always win. bg + border from tokens (ADR 0008), and the
      // bottom padding clears the home indicator on iOS.
      className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-card px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] md:hidden"
    >
      <div className="min-w-0 flex-1">
        {/* At 360px a long basket ("100 deler") overflows this line. The COUNT
            is the half worth keeping, so it never shrinks and the title
            truncates instead — the reverse loses exactly the information the
            bar exists to show. */}
        <p className="flex items-baseline gap-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          <span className="truncate">{tc("stickyBar.title")}</span>
          <span className="shrink-0 whitespace-nowrap">
            · {tc("stickyBar.pieces", { count: pieces })}
          </span>
        </p>
        <p
          data-testid="sticky-bar-total"
          className="truncate text-base font-semibold tabular-nums"
        >
          {formatMoney(total, locale)}
          {totalSuffix}
        </p>
      </div>
      {/* Same pill as the cart panel's CTA (§3.16) and the same label key, so
          R-PAY reskins both from one place. It carries the arrow because it
          DOES advance the funnel — see the e2e note in r-extra-pill. */}
      <NextStepPill
        data-testid="sticky-bar-checkout"
        className="shrink-0"
        label={to("title")}
        arrow
        onClick={() => {
          // Giro garanzia: one tap must land the customer IN the form with the
          // keyboard already up — scrolling to a collapsed cart and making them
          // hunt for a second CTA was the complaint. `flushSync` renders the
          // form INSIDE this click's own user gesture: a focus() one React tick
          // later is no longer a gesture and iOS keeps the keyboard shut.
          // No modal: a Cloudflare Turnstile inside a Dialog is risk for
          // nothing, and mobile checkout gets rethought in R-PAY.
          flushSync(() => setCheckoutOpen(true));
          // Scoped to the mobile block on purpose: `cartPanel` is rendered
          // twice (mobile section + desktop rail), so an unscoped query would
          // just as happily find the hidden desktop copy.
          const form = orderBlockRef.current?.querySelector<HTMLElement>(
            '[data-testid="docked-checkout-form"]'
          );
          form?.scrollIntoView({ behavior: "smooth", block: "start" });
          form
            ?.querySelector<HTMLInputElement>('[data-testid="order-name"]')
            ?.focus({ preventScroll: true });
        }}
        icon={
          <PillIcon>
            <Truck className="size-5 text-primary" />
          </PillIcon>
        }
      />
    </div>
  );

  return (
    <div
      data-testid="ceramics-step"
      // The bar is `fixed`, so it sits ON the page: without this the last rows
      // of the order block stay under it and the CTA is unreachable.
      className={showStickyBar ? "pb-24 md:pb-0" : undefined}
    >
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

      {/* R4-CTA-STICKY — fixed order bar, MOBILE ONLY.
          A sticky summary bar was removed here in a past round ("stray action
          footer"); this one is back on the client's own request (Alessio 26/8:
          the order CTA sat too far down and read as hidden), styled after the
          italianinoslo reference. What makes it different from the one that was
          removed: it only exists once the basket has something in it, and it
          steps aside for the product sheet instead of stacking under it.

          Desktop keeps NOTHING: the right rail is already the answer there, and
          a second CTA would compete with it. */}
      {stickyBar}

      {/* F21: two-column grid on desktop; single column + stacked cart on mobile */}
      <div className="grid grid-cols-1 items-start gap-7 md:grid-cols-2">
        {/* LEFT: ceramic selector */}
        <div className="flex min-w-0 flex-col">
          <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {tc("stepIndicator", { step: 3 })}
          </p>
          <h2 className="mb-4 mt-1 text-xl font-semibold">{t("title")}</h2>

          {yourSelectionStrip}

          {/* §3.18: one section per series, 22px apart; 2 cols / gap-2.5 under
              960px, 3 cols / gap-3 from 960px. */}
          <div className="flex flex-col gap-[22px]" data-testid="ceramics-grid">
            {sections.map((s) => (
              <section key={s.label ?? "__ungrouped"} data-testid="ceramics-series">
                {s.label && (
                  <h3 className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-semibold">
                    <span className="min-w-0 break-words">{s.label}</span>
                    <small className="whitespace-nowrap text-[11px] font-normal uppercase tracking-[0.06em] text-muted-foreground">
                      {tc("step3.seriesCount", { n: s.items.length })}
                    </small>
                  </h3>
                )}
                <div className="grid grid-cols-2 gap-2.5 min-[960px]:grid-cols-3 min-[960px]:gap-3">
                  {s.items.map((p) => (
                    <CeramicCard
                      key={p.id}
                      product={p}
                      locale={locale}
                      onOpen={() => openProduct(p.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Mobile: docked cart section (below selector, above sticky bar) */}
          <div
            ref={orderBlockRef}
            className="mt-6 md:hidden"
            data-testid="mobile-cart-section"
          >
            {cartPanel}
            {/* Zero-height end marker: what the sticky bar watches to know the
                order CTA has arrived (see `orderEndRef`). */}
            <div ref={orderEndRef} aria-hidden />
          </div>
        </div>

        {/* RIGHT (desktop only): docked cart always visible.
            mockup v5 `.cols`: the rail's top edge sits level with the catalog
            column's first series heading. Here the left column carries the
            kicker + <h2> above the grid, so the rail is nudged down by their
            combined height (measured 64.5px at md and above — both are
            fixed-size text blocks, so one constant covers every breakpoint).
            Update this if that heading block changes. */}
        <div
          className="hidden min-w-0 rounded-sm border border-border bg-card p-5 md:mt-16 md:block md:sticky md:top-4 md:self-start"
          data-testid="docked-cart-panel"
        >
          {yourSelectionBox}
          {cartPanel}
        </div>
      </div>

      {/* §3.19: one Radix Dialog, centred ≥640px / bottom sheet below. The
          product stays mounted while `sheetOpen` is false so the exit
          animation can run. */}
      <ProductSheet
        product={opened}
        open={sheetOpen}
        onOpenChange={setSheet}
        locale={locale}
        qty={qty}
        onQty={setQty}
        onAdd={addOpened}
        designLayers={designLayers}
      />

      {/* §3.20: visible confirmation, replacing the old sr-only announcement.
          The live region is mounted for good and only its content toggles — a
          role="status" that appears together with its text is announced
          unreliably (same reason the old sr-only span was always there). */}
      <div
        role="status"
        aria-live="polite"
        // R4-CTA-STICKY: on mobile the toast fires exactly when the order bar
        // appears, so at `bottom-6` it landed ON the bar. Clear it: the bar is
        // 10px + 72px pill + 10px + safe-area tall, plus 12px of breathing room.
        // Desktop has no bar and keeps the original offset.
        className="pointer-events-none fixed bottom-[calc(104px+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 md:bottom-6"
      >
        {toast && (
          <span
            data-testid="add-toast"
            className="flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-foreground shadow-(--shadow-card) motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-5"
          >
            {/* decorative: screen readers would read it as "check mark" */}
            <span aria-hidden>✓</span>
            {t("added")}
          </span>
        )}
      </div>
    </div>
  );
}
