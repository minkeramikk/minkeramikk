"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ZoomIn } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DesignRound } from "@/components/ui-domain/design-round";
import { SetBadge } from "@/components/ui-domain/set-badge";
import { PhotoLightbox } from "@/components/ui-domain/photo-lightbox";
import { CLOSE_DISC } from "@/components/ui-domain/close-disc";
import { assetUrl } from "@/lib/storage";
import { PRODUCT_THUMB_WIDTH } from "@/lib/asset-variants";
import { formatMoney, money, multiply, percentOf, subtract } from "@/lib/money/money";
import { displayPhotos } from "@/lib/catalog/product-photos";
import { ATTR_ICON } from "@/components/ui-domain/attribute-icons";
import {
  attributeLabel,
  formatAttributeValue,
  publicAttributes,
} from "@/lib/catalog/product-attributes";
import { SheetOfferBlock } from "@/components/ui-domain/sheet-offer-block";
import { DiscountLadder } from "@/components/ui-domain/discount-ladder";
import type { SheetOffer } from "@/lib/discounts/sheet-offer";
import type { Ladder } from "@/lib/discounts/ladder";
import type { CartLayer } from "@/lib/cart/cart";
import type { CeramicProduct } from "@/app/[locale]/(public)/configurator/ceramics-step";
import { cn } from "@/lib/utils";

/**
 * R4-STEP3 — product detail sheet (DESIGN-SYSTEM §3.19 / §3.19-bis).
 *
 * ONE Radix `Dialog` with responsive classes, never two components swapped by a
 * JS media query: swapping would unmount/remount on every resize or rotation and
 * lose qty, scroll and focus mid-interaction (§3.19).
 *
 * - `<640px`: bottom sheet — anchored bottom, full width, `rounded-t-lg`,
 *   safe-area padding, sticky buy row. NO grab handle (R4-FIX: a false
 *   affordance — nothing drags) and no swipe-to-dismiss: the ✕ closes.
 * - `≥640px`: centred dialog, `min(860px,96vw)`, 2 internal columns 1.05fr/1fr.
 *
 * ponytail: the photo/thumb degrade lives in `displayPhotos`, the lightbox body
 * in `PhotoLightbox` (F41) — this file only composes them.
 */
export function ProductSheet({
  product: p,
  open,
  onOpenChange,
  locale,
  qty,
  onQty,
  onAdd,
  designLayers,
  offers,
  takenRuleIds,
  onTakeOffer,
  ladder,
  ladderExcluded,
  inCartQty,
}: {
  /** null = nothing selected; the sheet renders nothing at all. */
  product: CeramicProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: "no" | "en";
  qty: number;
  onQty: (next: number) => void;
  /** Adds to the cart; the caller closes the sheet and shows the toast (§3.20). */
  onAdd: () => void;
  /** F37: current config layers (empty → no composed pair rendered). */
  designLayers: CartLayer[];
  /** R4-UPSELL-MODALE (§3.24) / R4-SCONTI-2 §D: every eligible offer, in the
   *  admin's order. Empty → the band does not exist and the sheet renders as it
   *  did before this block (AC5). The ONE caller always computes it (F4). */
  offers: SheetOffer[];
  /** Rules already taken in this sheet session (§D.2): marked, not pressable. */
  takenRuleIds: string[];
  /** Takes one offer: adds the base (only when the basket does not already fire
   *  the rule) plus the offer's ceramic, and LEAVES THE SHEET OPEN (§D.2). */
  onTakeOffer: (offer: Extract<SheetOffer, { kind: "unlocked" }>) => void;
  /** R4-SCONTI-2 §C: the quantity scale, computed over CART + SELECTOR by the
   *  caller. Null → no scale at all, and no empty frame. */
  ladder: Ladder | null;
  /** The product sits outside the discount multi-select: one line says so. */
  ladderExcluded: boolean;
  /** Pieces of this product already in the basket (all designs). */
  inCartQty: number;
}) {
  // TODO:nb-review NO copy: productSheet.close
  const tCfg = useTranslations("configurator");
  const tCart = useTranslations("cart");
  // which photo the lightbox shows (null = closed). Nested inside the sheet's
  // content, so Radix's dismissable-layer stack gives us §3.19's "Esc closes the
  // lightbox first, then the sheet" for free.
  const [lightboxAt, setLightboxAt] = useState<number | null>(null);
  // Unreachable while the caller closes the sheet between products, but a
  // lightbox left open onto the previous ceramic's photos would be a bad bug
  // for one line of insurance.
  useEffect(() => setLightboxAt(null), [p?.id]);
  /**
   * a11y (§3.19): focus goes back to whatever opened the sheet. Radix's modal
   * DialogContent preventDefaults FocusScope's own restore and focuses its
   * `DialogTrigger` instead — this sheet is controlled and has no trigger, so
   * without this the focus falls to <body>. `onCloseAutoFocus` fires at unmount,
   * as `hideOthers()` is undone, so screen readers actually announce the move.
   */
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) trigger.current = document.activeElement as HTMLElement | null;
  }, [open]);

  if (!p) return null;

  const name = locale === "no" ? p.nameNo : p.nameEn;
  const series = locale === "no" ? p.seriesNo : p.seriesEn;
  const description = locale === "no" ? p.descriptionNo : p.descriptionEn;
  const subtitle = tCfg("productSheet.subtitle");
  // §3.19-bis: 2 photos → two square frames; 1 → one full-width frame; 0 → the
  // catalog thumb in that same wide frame; nothing at all → no photo block.
  const photos = displayPhotos(p.photos, p.image);
  // The lightbox is for REAL photos only. `displayPhotos` degrades to the
  // catalog thumb — that is the same tiny art already on the grid card, so
  // enlarging it shows nothing new: the fallback frame stays a still image
  // (no zoom hint, no click, no zoom cursor). Step 2 is unaffected: the design
  // filmstrip only ever renders real photos.
  const zoomable = (p.photos?.length ?? 0) > 0;
  // Storefront shows only customer-facing attributes (weight is internal).
  const attributes = publicAttributes(p.attributes);
  // §C: the tier the ladder says is earned drives the price shown AND the CTA's
  // total — one number, derived once, so the two cannot disagree.
  const tierPct = ladder?.pct ?? 0;
  const unitFull = money(p.priceCents, p.currency);
  const unitNet = tierPct > 0 ? subtract(unitFull, percentOf(unitFull, tierPct)) : unitFull;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        data-testid="product-sheet"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          trigger.current?.focus();
        }}
        // Mockup `.pm`: color-mix(in oklab, var(--mk-dark), transparent 30%).
        // `--foreground` IS `--mk-dark`, and `/70` compiles to the same
        // color-mix. No blur: the mockup has none, and it muddies the scrim.
        overlayClassName="bg-foreground/70 supports-backdrop-filter:backdrop-blur-none"
        className={cn(
          // mobile: bottom sheet, anchored to the bottom edge, full width
          "top-auto bottom-0 left-1/2 w-full max-w-none! -translate-x-1/2 translate-y-0",
          "max-h-[88dvh] overflow-y-auto rounded-t-lg rounded-b-none",
          "px-4 pt-[26px] pb-[calc(14px+env(safe-area-inset-bottom))]",
          "shadow-[0_12px_40px_color-mix(in_oklab,var(--foreground)_28%,transparent)]",
          // ≥640: centred dialog
          "sm:top-1/2 sm:bottom-auto sm:max-h-[90vh] sm:w-[min(860px,96vw)] sm:max-w-none!",
          "sm:-translate-y-1/2 sm:rounded-lg sm:p-5",
          // Entrance (§3.19). The base DialogContent hardcodes `fade-in-0
          // zoom-in-95` with no breakpoint, and tailwind-merge does not know
          // tw-animate-css utilities, so it cannot drop them — the `!` modifier
          // is the only deterministic override. Mobile "up": translateY(24%)→0,
          // .22s. Desktop "pop": scale(.97)+60% opacity→1, .18s.
          "ease-out duration-[220ms] sm:duration-[180ms]",
          "data-open:fade-in-100! data-open:zoom-in-100! data-open:slide-in-from-bottom-[24%]!",
          "sm:data-open:fade-in-60! sm:data-open:zoom-in-[0.97]! sm:data-open:slide-in-from-bottom-0!",
          // §3.19: both entrances are suppressed under prefers-reduced-motion.
          "motion-reduce:animate-none!"
        )}
      >
        {/* R4-FIX: no grab handle. It read as "drag me to dismiss" and nothing
            here drags — swipe-down-to-close is deliberately NOT in this round.
            Closing is the ✕ (and Esc / backdrop), as it always was. */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={tCfg("productSheet.close")}
          data-testid="product-sheet-close"
          // R4-POLISH voce 4: the disc itself lives in `CLOSE_DISC` — the same
          // one the photo lightbox uses, so the two can never drift apart.
          className={cn("absolute top-2.5 right-3 z-2", CLOSE_DISC)}
        >
          ✕
        </button>

        <div className="grid gap-3.5 sm:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] sm:gap-[18px]">
          <div>
            {/* §3.19-bis: no photo AND no catalog thumb → no block at all, the
                sheet stays single-column and purely informational. */}
            {photos.length > 0 && (
              <div className={cn("grid gap-2.5", photos.length > 1 && "grid-cols-2")}>
                {photos.map((img, i) => {
                  const frame = (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- catalog art from storage */}
                      <img
                        src={assetUrl(img)}
                        alt={zoomable ? "" : tCfg("productSheet.photoOf", { name })}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                      {/* zoom pill on the first frame only (mockup) */}
                      {zoomable && i === 0 && (
                        <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-ink px-[9px] py-[3px] text-[10.5px] tracking-[0.04em] text-ink-foreground">
                          <ZoomIn className="size-3" aria-hidden />
                          {tCfg("productSheet.zoomHint")}
                        </span>
                      )}
                    </>
                  );
                  const box = "relative aspect-square overflow-hidden rounded-sm border border-border bg-muted";
                  return zoomable ? (
                    <button
                      key={img + i}
                      type="button"
                      onClick={() => setLightboxAt(i)}
                      aria-label={tCfg("productSheet.photoOf", { name })}
                      data-testid="product-photo"
                      className={cn(
                        box,
                        "cursor-zoom-in outline-none transition-colors hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50"
                      )}
                    >
                      {frame}
                    </button>
                  ) : (
                    <div key={img + i} data-testid="product-thumb-frame" className={box}>
                      {frame}
                    </div>
                  );
                })}
              </div>
            )}

            {/* F37 ②: the current design shown NEXT TO the ceramic photo (never
                composited onto it). Photo missing → only the design round, like the
                cart rows. Self-gates on an empty config (AC4 / ?set= landing).
                §3.19: the muted-card `.pair` variant of mockup v5 — bg `--muted`,
                `--radius-sm`, 10px/12px padding, 10px gap and 10px off the photo
                frames above, 44px thumb and design round centred with the label.
                The two images stay SEPARATE: never composited (F37's rule). */}
            {designLayers.length > 0 && (
              <div
                data-testid="expanded-composed-preview"
                className="mt-2.5 flex items-center gap-2.5 rounded-sm bg-muted px-3 py-2.5 text-[12.5px]"
              >
                <div className="flex shrink-0 items-center gap-2">
                  {p.image && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- catalog art from storage */}
                      <img
                        src={assetUrl(p.image, { width: PRODUCT_THUMB_WIDTH })}
                        alt=""
                        aria-hidden
                        className="size-11 shrink-0 rounded-full object-cover"
                      />
                      <span aria-hidden className="font-semibold text-muted-foreground">
                        +
                      </span>
                    </>
                  )}
                  <DesignRound layers={designLayers} className="size-11" />
                </div>
                {/* R4-FIX: was `text-primary` (the violet) — same ruling as the
                    subtitle above: this line is body copy, so it is the DS black. */}
                <p className="min-w-0 font-medium text-foreground">
                  {tCfg("yourSelection.pairCaption")}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <div>
              {/* The dialog's accessible name IS the product name — one node,
                  no sr-only duplicate for the screen reader to read twice. */}
              <DialogTitle className="text-lg leading-snug font-semibold">{name}</DialogTitle>
              {/* R4-FIX: `text-foreground` (= `--mk-dark`, the design-system
                  black — never a literal #000). The muted grey was unreadable
                  next to the title on a phone. */}
              <p className="text-xs text-foreground">
                {series ? `${series} · ${subtitle}` : subtitle}
              </p>
            </div>

            {/* §C: applied REWRITES the unit price — a badge on the full price
                reads as a promise, a price that falls reads as a fact. */}
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span data-testid="sheet-unit-price" className="text-2xl font-semibold tabular-nums">
                {formatMoney(unitNet, locale)}
              </span>
              {tierPct > 0 && (
                <>
                  <s
                    aria-hidden="true"
                    data-testid="sheet-unit-full"
                    className="text-sm text-muted-foreground tabular-nums"
                  >
                    {formatMoney(unitFull, locale)}
                  </s>
                  <span
                    data-testid="sheet-unit-badge"
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap"
                    style={{
                      backgroundColor: "color-mix(in oklab, var(--discount) 16%, white)",
                      color: "color-mix(in oklab, var(--discount), black 34%)",
                      border: "1px solid color-mix(in oklab, var(--discount) 38%, white)",
                    }}
                  >
                    {tCart("discount.badge", { pct: tierPct })}
                  </span>
                </>
              )}
              <SetBadge count={p.pieces} />
            </div>

            {/* R2-6 F (rev 2): typed metadata, unchanged from the expanded panel.
                Weight stays internal (publicAttributes filters it). Self-gates. */}
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

            {description && (
              <p
                data-testid="product-details"
                className="text-sm leading-relaxed text-muted-foreground"
              >
                {description}
              </p>
            )}

            {/* §3.26: the scale, then the offers, then the buy row — the
                prototype's own order (mockup-sconti-scheda.html): the scale is
                the last thing between the description and the controls that
                change the number it reads. */}
            <DiscountLadder
              ladder={ladder}
              excluded={ladderExcluded}
              inCart={inCartQty}
              onSetQty={onQty}
            />

            {/* §3.24: absent entirely when there is nothing to show — an empty
                list renders no node, so the sheet stays byte-identical (AC5). */}
            <SheetOfferBlock
              offers={offers}
              currentName={name}
              locale={locale}
              takenRuleIds={takenRuleIds}
              onSetQty={onQty}
              onTake={onTakeOffer}
            />

            {/* Buy row — sticky at the bottom of the scroller on mobile (§3.19),
                static in the desktop column where `mt-auto` pins it to the end. */}
            <div className="sticky bottom-0 mt-auto bg-card pt-2.5 shadow-[0_-8px_12px_-8px_color-mix(in_oklab,var(--foreground)_15%,transparent)] sm:static sm:shadow-none">
              <div className="flex items-center gap-2.5">
              <div className="flex items-center rounded-full border border-border bg-background">
                <button
                  type="button"
                  aria-label={tCart("decreaseQty")}
                  data-testid="qty-dec"
                  onClick={() => onQty(Math.max(1, qty - 1))}
                  className="flex h-11 w-10 items-center justify-center rounded-l-full text-lg text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  −
                </button>
                <span
                  data-testid="qty-value"
                  className="min-w-[26px] text-center text-sm font-semibold tabular-nums"
                >
                  {qty}
                </span>
                <button
                  type="button"
                  aria-label={tCart("increaseQty")}
                  data-testid="qty-inc"
                  onClick={() => onQty(qty + 1)}
                  className="flex h-11 w-10 items-center justify-center rounded-r-full text-lg text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  +
                </button>
              </div>
              {/* No "Added ✓" state any more — the caller closes the sheet and
                  raises the §3.20 toast instead. */}
              <Button
                size="lg"
                className="min-h-11 flex-1"
                data-testid="add-to-cart"
                onClick={onAdd}
              >
                {/* R4-SCONTI-2 §D.1: the CTA carries the quantity ALWAYS, not
                    only beside an offer (supersedes D-Q1) — with the scale
                    rewriting the unit price above, a CTA without a figure would
                    be the one number missing from the column. */}
                {`${tCart("add")} · ${formatMoney(multiply(unitNet, qty), locale)}`}
              </Button>
              </div>
            </div>
          </div>
        </div>

        {/* F41 lightbox — same wrapper as the step-2 filmstrip, so the two are
            visually identical. Mounted inside the sheet's content: Radix stacks
            it above, so Esc dismisses the lightbox first (§3.19). */}
        <Dialog open={lightboxAt !== null} onOpenChange={(o) => !o && setLightboxAt(null)}>
          <DialogContent
            showCloseButton={false}
            aria-describedby={undefined}
            className="top-0 left-0 flex h-dvh max-w-none! translate-x-0 translate-y-0 gap-0 rounded-none bg-black/90 p-0 ring-0 sm:max-w-none!"
            data-testid="product-photo-lightbox"
          >
            <DialogTitle className="sr-only">{name}</DialogTitle>
            <PhotoLightbox
              images={photos}
              alt={name}
              startAt={lightboxAt ?? 0}
              onClose={() => setLightboxAt(null)}
            />
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
