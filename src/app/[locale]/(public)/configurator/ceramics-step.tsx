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
  attributeLabel,
  formatAttributeValue,
  publicAttributes,
  type TypedAttribute,
  type AttributeKey,
} from "@/lib/catalog/product-attributes";
import { fullRowInsertIndex } from "@/lib/configurator/grid-rows";
import { Weight, Circle, Ruler, Tag, Check, ChevronDown, MoveVertical, Container } from "lucide-react";
import type { ResolvedSharedSet } from "./resolve-shared-set";
import { cn } from "@/lib/utils";
import { NewDesignButton } from "./new-design-button";

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

const ATTR_ICON: Record<AttributeKey, typeof Weight> = {
  weight: Weight,
  diameter: Circle,
  dimensions: Ruler,
  height: MoveVertical,
  volume: Container,
  custom: Tag,
};

/**
 * R2-3+R2-4 — compact step-3 ceramic card with the shared F13 hover/focus
 * preview. Selecting a card opens the `ExpandedProductCard` full-row panel
 * below the row — no "i" button, no modal.
 */
function CeramicOptionCard({
  product: p,
  selected,
  locale,
  onSelect,
}: {
  product: CeramicProduct;
  selected: boolean;
  locale: "no" | "en";
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { show, hide, ...preview } = useHoverPreview(ref, Boolean(p.image));
  const name = locale === "no" ? p.nameNo : p.nameEn;
  const price = formatMoney(money(p.priceCents, p.currency), locale);

  return (
    <>
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
          "relative flex min-h-11 w-full flex-col items-center gap-1 rounded-sm border-[1.5px] p-2 text-center transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
          selected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-ring",
        ].join(" ")}
      >
        <SetBadge count={p.pieces} className="absolute right-1 top-1 z-10" />
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

      {p.image && (
        <HoverPreviewCard state={{ show, hide, ...preview }} testId="product-preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- catalog art from storage */}
          <img src={assetUrl(p.image)} alt={name} className="size-44 object-contain" />
          <span className="mt-1 block text-center text-xs font-medium">{name}</span>
          <span className="block text-center text-xs text-muted-foreground">{price}</span>
          {p.pieces > 1 && (
            <span className="mt-1 flex justify-center">
              <SetBadge count={p.pieces} />
            </span>
          )}
        </HoverPreviewCard>
      )}
    </>
  );
}

/**
 * R2-3+R2-4 — full-row expanded panel rendered after the selected card's row.
 * Contains qty stepper + Add anchored at top, aria-live confirmation, the typed
 * spec chips ALWAYS visible, and a chevron "Product details" toggle (CLOSED by
 * default) that reveals the product description (R2-6 F, rev 2).
 */
function ExpandedProductCard({
  product: p,
  locale,
  qty,
  onQty,
  onAdd,
  onNewDesign,
  tCart,
  tCfg,
}: {
  product: CeramicProduct;
  locale: "no" | "en";
  qty: number;
  onQty: (next: number) => void;
  onAdd: () => void;
  onNewDesign: () => void;
  tCart: (k: string) => string;
  tCfg: (k: string) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // R2 fix: the "added" confirmation shows ONLY right after a successful add,
  // then auto-dismisses (it used to render by default on every card).
  const [showAdded, setShowAdded] = useState(false);
  // R2-6 F (rev 2): "Product details" (the description) is expandable, CLOSED by
  // default. The typed spec chips above stay always-visible, outside this toggle.
  const [open, setOpen] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const description = locale === "no" ? p.descriptionNo : p.descriptionEn;
  // Storefront shows only customer-facing attributes (weight is internal).
  const attributes = publicAttributes(p.attributes);

  function handleAdd() {
    if (showAdded) return; // no-op while the "Added ✓" confirmation is showing
    onAdd();
    setShowAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setShowAdded(false), 2000);
  }

  // Clear the dismiss timer on unmount — and thus on selection change, since
  // the panel remounts per selected product (key=`exp-<id>`).
  useEffect(() => {
    return () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    };
  }, []);

  // a11y: bring the panel into view on (re)selection, but never yank focus.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [p.id]);

  return (
    <div
      ref={ref}
      data-testid="expanded-card"
      style={{ gridColumn: "1 / -1" }}
      className="flex flex-col gap-2 rounded-md border border-primary/50 bg-primary/5 p-3"
    >
      {/* Add — primary, anchored at the top so opening details never scrolls it away */}
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-sm border border-border bg-card">
          <button
            type="button"
            aria-label="-"
            data-testid="qty-dec"
            onClick={() => onQty(Math.max(1, qty - 1))}
            className="flex size-11 items-center justify-center text-lg"
          >
            −
          </button>
          <span data-testid="qty-value" className="w-10 text-center text-sm tabular-nums">
            {qty}
          </span>
          <button
            type="button"
            aria-label="+"
            data-testid="qty-inc"
            onClick={() => onQty(qty + 1)}
            className="flex size-11 items-center justify-center text-lg"
          >
            +
          </button>
        </div>
        {/* On a successful add the button flips to an inverted "Added ✓" state
            (white bg + accent text/border) and goes no-op for ~2s, then reverts.
            No size change → no layout shift. */}
        <Button
          className={cn(
            "min-h-11 flex-1",
            showAdded && "pointer-events-none border-primary bg-card text-primary"
          )}
          size="lg"
          data-testid="add-to-cart"
          aria-disabled={showAdded}
          onClick={handleAdd}
        >
          {showAdded ? (
            <span
              data-testid="add-feedback"
              className="inline-flex items-center gap-1.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
            >
              <Check className="size-4" aria-hidden />
              {tCart("added")}
            </span>
          ) : (
            tCart("add")
          )}
        </Button>
      </div>

      {/* The confirmation lives ON the Add button (no extra space, no layout
          shift). This sr-only live region gives the screen reader the same
          polite announcement while occupying zero layout. */}
      <span className="sr-only" aria-live="polite">
        {showAdded ? tCart("added") : ""}
      </span>

      {/* R2-6 F (rev 2): typed metadata is ALWAYS visible (no chevron) and sits
          above "Product details". The description lives behind an expandable
          "Product details" toggle, CLOSED by default. Weight stays internal
          (publicAttributes filters it). Each section self-gates: no attributes
          → no chip row; no description → no toggle. */}
      {attributes.length > 0 && (
        <ul data-testid="spec-chips" className="flex flex-wrap gap-2">
          {attributes.map((a, i) => {
            const Icon = ATTR_ICON[a.key];
            return (
              <li
                key={i}
                data-testid="spec-chip"
                className="flex items-center gap-1.5 rounded-sm border border-border bg-card px-2 py-1 text-xs"
              >
                <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">{attributeLabel(a, locale)}</span>
                <span className="font-medium">{formatAttributeValue(a, locale)}</span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Card footer (design critique, option A): the "Product details" toggle
          (left, when there's a description) shares one row with the low-emphasis
          "new design" CTA (right). Same row → no vertical push above the details.
          The expanded description drops full-width below. */}
      <div className="flex items-center justify-between gap-2">
        {description ? (
          <button
            type="button"
            data-testid="details-toggle"
            aria-expanded={open}
            aria-controls={`details-${p.slug}`}
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-11 items-center gap-1 text-sm font-medium text-foreground"
          >
            {tCfg("productCard.details")}
            <ChevronDown
              className={cn("size-4 transition-transform", open && "rotate-180")}
              aria-hidden
            />
          </button>
        ) : (
          <span />
        )}
        <NewDesignButton onClick={onNewDesign} />
      </div>
      {description && open && (
        <p
          id={`details-${p.slug}`}
          data-testid="product-details"
          className="text-sm text-foreground"
        >
          {description}
        </p>
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

  // R2-3: live column count (2 under sm, 3 from sm) → where the full-row panel goes.
  const [cols, setCols] = useState(2);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const apply = () => setCols(mq.matches ? 3 : 2);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const selected = products.find((p) => p.id === selectedId) ?? null;

  // R1-FB2/FB4: warm the ceramic photos in idle (desktop) — covers the
  // lazy-loaded below-the-fold thumbs so the hover popup is instant too.
  const warmupUrls = useMemo(
    () => products.map((p) => (p.image ? assetUrl(p.image) : null)),
    [products]
  );
  useWarmupPreviews(warmupUrls);

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
      productSlug: selected.slug,
      pieces: selected.pieces,
    });
    setQty(1);
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

  const gridNodes = useMemo(() => {
    const selectedIndex = products.findIndex((p) => p.id === selectedId);
    const insertAfter = fullRowInsertIndex(selectedIndex, cols, products.length);
    const nodes: React.ReactNode[] = [];
    products.forEach((p, i) => {
      nodes.push(
        <CeramicOptionCard
          key={p.id}
          product={p}
          selected={p.id === selectedId}
          locale={locale}
          onSelect={() => setSelectedId(p.id)}
        />
      );
      if (i === insertAfter && selected) {
        nodes.push(
          <ExpandedProductCard
            key={`exp-${selected.id}`}
            product={selected}
            locale={locale}
            qty={qty}
            onQty={setQty}
            onAdd={addSelected}
            onNewDesign={() => goToStep(1)}
            tCart={t}
            tCfg={tc}
          />
        );
      }
    });
    return nodes;
    // addSelected/setQty/setSelectedId/t/tc are stable for the render; qty &
    // selection drive the rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, selectedId, selected, cols, qty, locale]);

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

      {/* R3-C: start another design from the cart recap (keeps the basket — F03/
          F16 persistence → accumulate multiple designs). Same shared component
          and handler as the in-card instance — compact, low-emphasis. */}
      <NewDesignButton onClick={() => goToStep(1)} className="mt-3 self-start" />
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
          <h2 className="mb-4 mt-1 text-xl font-semibold">{t("title")}</h2>

          <div
            role="radiogroup"
            aria-label={t("title")}
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
          >
            {gridNodes}
          </div>

          {/* R3-C-bis: the selector's "new design" CTA moved INTO the expanded
              product card, directly under "Add to basket" (design critique). */}

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
