"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Weight,
  Circle,
  Ruler,
  Tag,
  MoveVertical,
  MoveHorizontal,
  Container,
  ZoomIn,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DesignRound } from "@/components/ui-domain/design-round";
import { SetBadge } from "@/components/ui-domain/set-badge";
import { PhotoLightbox } from "@/components/ui-domain/photo-lightbox";
import { assetUrl } from "@/lib/storage";
import { formatMoney, money } from "@/lib/money/money";
import { displayPhotos } from "@/lib/catalog/product-photos";
import {
  attributeLabel,
  formatAttributeValue,
  publicAttributes,
  type AttributeKey,
} from "@/lib/catalog/product-attributes";
import type { CartLayer } from "@/lib/cart/cart";
import type { CeramicProduct } from "@/app/[locale]/(public)/configurator/ceramics-step";
import { cn } from "@/lib/utils";

/** Icon per typed attribute key (R2-6-F spec chips). Shared with step 3. */
export const ATTR_ICON: Record<AttributeKey, typeof Weight> = {
  weight: Weight,
  diameter: Circle,
  dimensions: Ruler,
  height: MoveVertical,
  length: MoveHorizontal,
  volume: Container,
  custom: Tag,
};

/**
 * R4-STEP3 — product detail sheet (DESIGN-SYSTEM §3.19 / §3.19-bis).
 *
 * ONE Radix `Dialog` with responsive classes, never two components swapped by a
 * JS media query: swapping would unmount/remount on every resize or rotation and
 * lose qty, scroll and focus mid-interaction (§3.19).
 *
 * - `<640px`: bottom sheet — anchored bottom, full width, `rounded-t-lg`,
 *   grab handle, safe-area padding, sticky buy row. The ✕ stays (closing is
 *   never swipe/backdrop-only).
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
}) {
  const tCfg = useTranslations("configurator");
  const tCart = useTranslations("cart");
  // which photo the lightbox shows (null = closed). Nested inside the sheet's
  // content, so Radix's dismissable-layer stack gives us §3.19's "Esc closes the
  // lightbox first, then the sheet" for free.
  const [lightboxAt, setLightboxAt] = useState<number | null>(null);

  if (!p) return null;

  const name = locale === "no" ? p.nameNo : p.nameEn;
  const series = locale === "no" ? p.seriesNo : p.seriesEn;
  const description = locale === "no" ? p.descriptionNo : p.descriptionEn;
  const subtitle = tCfg("productSheet.subtitle");
  // §3.19-bis: 2 photos → two square frames; 1 → one full-width frame; 0 → the
  // catalog thumb in that same wide frame; nothing at all → no photo block.
  const photos = displayPhotos(p.photos, p.image);
  // Storefront shows only customer-facing attributes (weight is internal).
  const attributes = publicAttributes(p.attributes);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        data-testid="product-sheet"
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
        {/* grab handle — mobile only (42×4.5px, §3.19) */}
        <span
          aria-hidden
          className="absolute top-2 left-1/2 h-[4.5px] w-[42px] -translate-x-1/2 rounded-full bg-border sm:hidden"
        />
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={tCfg("productSheet.close")}
          data-testid="product-sheet-close"
          // 36px disc like the mockup; `after` stretches the hit area to 44px
          // so the touch target rule (§5) holds without changing the visual.
          className="absolute top-2.5 right-3 z-2 flex size-9 items-center justify-center rounded-full bg-muted text-base outline-none after:absolute after:-inset-1 after:content-[''] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          ✕
        </button>

        <div className="grid gap-3.5 sm:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] sm:gap-[18px]">
          <div>
            {/* §3.19-bis: no photo AND no catalog thumb → no block at all, the
                sheet stays single-column and purely informational. */}
            {photos.length > 0 && (
              <div className={cn("grid gap-2.5", photos.length > 1 && "grid-cols-2")}>
                {photos.map((img, i) => (
                  <button
                    key={img}
                    type="button"
                    onClick={() => setLightboxAt(i)}
                    aria-label={`${name} — ${tCfg("productSheet.zoomHint")}`}
                    data-testid="product-photo"
                    className="relative aspect-square cursor-zoom-in overflow-hidden rounded-sm border border-border bg-muted outline-none transition-colors hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- catalog art from storage */}
                    <img
                      src={assetUrl(img, { width: 1024 })}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                    {/* zoom pill on the first frame only (mockup) */}
                    {i === 0 && (
                      <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-ink px-[9px] py-[3px] text-[10.5px] tracking-[0.04em] text-ink-foreground">
                        <ZoomIn className="size-3" aria-hidden />
                        {tCfg("productSheet.zoomHint")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* F37 ②: the current design shown NEXT TO the ceramic photo (never
                composited onto it). Photo missing → only the design round, like the
                cart rows. Self-gates on an empty config (AC4 / ?set= landing).
                Copied unchanged from ExpandedProductCard — §3.19 says "invariata". */}
            {designLayers.length > 0 && (
              <div
                data-testid="expanded-composed-preview"
                className="flex items-center gap-3 border-b border-border/60 pb-3"
              >
                <div className="flex shrink-0 items-center gap-2">
                  {p.image && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- catalog art from storage */}
                      <img
                        src={assetUrl(p.image)}
                        alt=""
                        aria-hidden
                        className="size-20 rounded-md border border-border bg-card object-contain p-1"
                      />
                      <span aria-hidden className="text-lg font-semibold text-muted-foreground">
                        +
                      </span>
                    </>
                  )}
                  <DesignRound layers={designLayers} className="size-20" />
                </div>
                <p className="min-w-0 text-xs font-medium text-primary">
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
              <p className="text-xs text-muted-foreground">
                {series ? `${series} · ${subtitle}` : subtitle}
              </p>
            </div>

            <div className="flex items-baseline gap-2.5">
              <span className="text-2xl font-semibold tabular-nums">
                {formatMoney(money(p.priceCents, p.currency), locale)}
              </span>
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

            {/* Buy row — sticky at the bottom of the scroller on mobile (§3.19),
                static in the desktop column where `mt-auto` pins it to the end. */}
            <div className="sticky bottom-0 mt-auto flex items-center gap-2.5 bg-card pt-2.5 shadow-[0_-8px_12px_-8px_color-mix(in_oklab,var(--foreground)_15%,transparent)] sm:static sm:shadow-none">
              <div className="flex items-center rounded-full border border-border bg-background">
                <button
                  type="button"
                  aria-label="-"
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
                  aria-label="+"
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
                {tCart("add")}
              </Button>
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
