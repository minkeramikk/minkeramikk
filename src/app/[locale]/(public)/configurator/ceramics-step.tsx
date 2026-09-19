"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Stepper } from "@/components/ui-domain/stepper";
import { PaletteBar } from "@/components/ui-domain/palette-bar";
import { PaletteChip } from "@/components/ui-domain/palette-chip";
import { PaintingStrip } from "@/components/ui-domain/painting-strip";
import { nameFor, paletteFor, sortCurrentDesignFirst } from "@/lib/palettes/palettes";
import type { PaletteWords } from "@/lib/palettes/name-lists";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { assetUrl } from "@/lib/storage";
import { PRODUCT_CARD_WIDTH, PRODUCT_THUMB_WIDTH } from "@/lib/asset-variants";
import { formatMoney, money } from "@/lib/money/money";
import type { Currency } from "@/lib/money/money";
import { useCartContext, type CurrentConfig } from "@/lib/cart/cart-context";
import {
  cartPieces,
  designLabel,
  itemCount,
  lineKey,
  unpaintedPieces,
  type CartLayer,
  type ConfigSnapshot,
  type NewCartLine,
} from "@/lib/cart/cart";
import { encodeSetParam, SET_LINK_BUDGET } from "@/lib/cart/set-code";
import {
  activeSuggestions,
  cartSaved,
  included,
  type ActiveSuggestion,
  type DiscountLineInput,
} from "@/lib/discounts/discount";
import { ladderFor } from "@/lib/discounts/ladder";
import { SetBadge } from "@/components/ui-domain/set-badge";
import { useShippingTotalSuffix } from "@/components/ui-domain/cart-shipping-row";
import {
  formatAttributeValue,
  publicAttributes,
  type TypedAttribute,
} from "@/lib/catalog/product-attributes";
import { groupBySeries } from "@/lib/configurator/product-series";
import { Truck, Plus, ArrowUpRight, Brush } from "lucide-react";
import type { ResolvedSharedSet } from "./resolve-shared-set";
import { ProductSheet } from "@/components/ui-domain/product-sheet";
import { AddedSheet } from "@/components/ui-domain/added-sheet";
import { Basket, type BasketHandle } from "@/components/ui-domain/basket";
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

/**
 * §3.18 CeramicCard (R4-STEP3) — photo-led step-3 card. The whole card is one
 * button: click/tap opens `ProductSheet` (§3.19). Replaces the R2-3-4 compact
 * card that expanded in place, and drops the F13 hover preview with it — the
 * card's own photo IS the preview.
 *
 * That photo is the product's main picture (`image`), asked for at
 * PRODUCT_CARD_WIDTH (R4-IMG-512): the frame is square and ~180px wide at 390
 * (2 columns), ~300px from 960 up (3 columns), so 512 already covers DPR2 with
 * headroom. The `products` class width (1024) stays for the sheet and the
 * lightbox, which really do display the photo that big.
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
  // Ruling 28/08: the cover is ALWAYS the ceramic's main picture, never the
  // first gallery photo — the grid must stay a homogeneous catalogue. The
  // photos live only inside the sheet (gallery + lightbox, §3.19-bis).
  const cover = p.image;
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
            src={assetUrl(cover, { width: PRODUCT_CARD_WIDTH })}
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
  paletteWords,
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
  /** Resolved server-side once (page.tsx) — a `"use client"` file can't read
   *  `MK_PALETTE_WORDS` itself (fix wave finding, task 8/9). Only needed for
   *  `nameFor()` on the draft chip below; every SAVED palette already
   *  carries its own name. */
  paletteWords: PaletteWords;
}) {
  const t = useTranslations("cart");
  // TODO:nb-review NO copy: step3.seriesCount · stickyBar.title · stickyBar.pieces
  const tc = useTranslations("configurator");
  const to = useTranslations("order");
  const ta = useTranslations("actions");
  const tPaletteBar = useTranslations("palettes.bar");
  const locale = useLocale() as "no" | "en";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    cart,
    hydrated,
    add,
    clear,
    discount,
    discountConfig,
    setCurrentConfig,
    acceptSuggestion,
    allowedProduct: cartAllowedProduct,
    palettes,
    palettesHydrated,
    /** Fix round 1 — the checkout view is a mode of THE basket, held in the
     *  cart context now. Read here only to hide the sticky bar while the form
     *  is up, and written by the bar's own CTA below. */
    checkoutOpen,
    setCheckoutOpen,
    activeCode,
    setActiveCode,
    save: savePalette,
    touch: touchPalette,
    rename: renamePalette,
    remove: deletePalette,
  } = useCartContext();

  /**
   * R5-PALETTES task 9 — which palette is painting. Same rule as step 2's own
   * `matchedPalette` (card §4-bis: the active palette IS the URL): `configCode`
   * is a server prop derived from the URL, so whichever saved palette shares
   * its code is the one actually in use, full stop — no separate "current
   * palette" state to drift out of sync with what a ceramic will be painted
   * with when added.
   */
  // Declared this early because `paintingLabel` right below needs it as its
  // last-resort fallback, and the `PaletteBar`/`PaintingStrip` further down
  // print it as the design's own name beside whatever palette is painting.
  // (It used to be `rowThumb` that forced it up here; that moved to
  // `basket.tsx` in task 4 and these two kept it where it is.)
  const designName = designLabel(snapshot, locale) ?? "";
  const activePalette = paletteFor(palettes, configCode);
  /**
   * TL follow-up (post-task-12): the ONE name for "what's painting right
   * now" — the draft chip below and the basket header both used to compute
   * this themselves, and the header's own fallback (`designName`) was wrong
   * for the unsaved-draft case: a saved palette names it, an unsaved draft
   * IS still a real configuration and gets the same deterministic label
   * `nameFor()`/the draft chip already give it (`nameFor` never returns
   * empty, even with zero colours — see its own test), and `designName` is
   * the true last resort, for when there's no configuration to name at all.
   * Computed ONCE here so the two call sites can never drift apart again.
   */
  // Round 4 (TL-reported duplicate «Zaffera»): pass every already-saved
  // name so `nameFor()` picks a FREE word instead of repeating one — same
  // `palettes` list this step already reads, so this label (chip, basket
  // header, `saveDraftAsPalette` below) can't disagree with what gets saved.
  const paintingLabel =
    activePalette?.name ??
    nameFor(
      configCode,
      snapshot,
      paletteWords,
      palettes.map((p) => p.name)
    ) ??
    designName;

  /**
   * `activeCode` (persisted, cross-tab) is a DIFFERENT thing: a "last chosen"
   * pointer for surfaces that have no URL to read (the next PR's header/mobile
   * strip). Task 8 only ever WROTE it (on save); this is the first task that
   * READS it, which is also the first chance to hit the bug its own review
   * flagged — it can point at a palette that no longer exists (evicted by the
   * LRU when an 11th palette is saved, or wiped because another tab wrote a
   * different list). So: never trust the raw pointer, always resolve through
   * `paletteFor`, and reconcile in both directions — follow the URL forward
   * when it names a save, clear the pointer when it names nothing.
   */
  /** The one chip currently in rename mode (only one at a time — task 8's own rule). */
  const [renamingPaletteCode, setRenamingPaletteCode] = useState<string | null>(
    null
  );
  /** R5-PALETTES task 13 — the mobile strip's own "Palettes ▾" sheet, the
   *  `md:hidden` stand-in for the desktop bar's always-visible chip lane. */
  const [paletteSheetOpen, setPaletteSheetOpen] = useState(false);
  useEffect(() => {
    if (!palettesHydrated) return;
    if (activePalette) {
      if (activeCode !== activePalette.code) setActiveCode(activePalette.code);
    } else if (activeCode && !paletteFor(palettes, activeCode)) {
      setActiveCode(null);
    }
    // Fix wave A finding 4: a palette's code is a deterministic function of
    // its colours, so it RECURS — evict it via the LRU (or another tab
    // rewrites the list, the `storage` listener makes that routine), then
    // re-create the same colours, and the chip would mount already in
    // rename mode with `autoFocus` stealing focus. Same reconciliation this
    // effect already does for `activeCode`, same reason: never trust a
    // stale code-keyed pointer without checking it still resolves.
    if (renamingPaletteCode && !paletteFor(palettes, renamingPaletteCode)) {
      setRenamingPaletteCode(null);
    }
  }, [palettesHydrated, activePalette, activeCode, palettes, setActiveCode, renamingPaletteCode]);

  /**
   * Picking a chip: it becomes the active palette by becoming the URL (§4-bis)
   * — `configCode`/`snapshot`/`designLayers` are server props derived from it,
   * so this one navigation is also what repaints the canvas/thumbnails and
   * what the next "Add to basket" will use (built from those same props).
   * `touch()` bumps the LRU key so this save doesn't look unused next time the
   * list is trimmed.
   */
  function paintWith(code: string) {
    touchPalette(code, Date.now());
    setActiveCode(code);
    // Fix wave A finding 1: build from the CURRENT params, the way `goToStep`
    // below already does — a from-scratch URL was dropping note=/text=
    // (R2-2b/F38, the ONLY carrier for both at step 3) and set=/origin=set
    // (the shared-set banner), silently losing the customer's own words and
    // the shared basket on every chip tap.
    const params = new URLSearchParams(searchParams.toString());
    // Fix wave B finding 5 (minor) — `code=` already wins over stale `opt_*`
    // (page.tsx gives it priority, nothing breaks), but there's no reason to
    // carry both: a chip tap is a full colour pick, same as `selectDesign` in
    // configurator-client.tsx dropping `opt_*` on a design change.
    for (const key of [...params.keys()]) {
      if (key.startsWith("opt_")) params.delete(key);
    }
    params.set("code", code);
    params.set("step", "3");
    // Fix wave PR3 finding 3: the sheet is the phone's ONLY way to pick a
    // palette here, opened mid-page from the sticky strip — without
    // `scroll: false` every tap threw the customer back to the top of step
    // 3, same bug `loadPalette` (configurator-client.tsx) had. The sticky
    // desktop bar hid it there too; `resetPaletteDraft` already got this right.
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  /** The sheet's own tile pick: same effect as a chip tap (`paintWith`), plus
   *  closing the sheet — same rule the row picker already follows ("Mockup
   *  `selPal`: choosing one closes the picker", a few hundred lines below). */
  function paintWithFromSheet(code: string) {
    paintWith(code);
    setPaletteSheetOpen(false);
  }

  /**
   * The lane's chips: every saved palette, dim (and inert — card §6, switching
   * design from here is a later card) when it belongs to a different design,
   * else selectable and — if it's the one painting — carrying the brush badge.
   * Card §4-bis (added mid-PR): the CURRENT design's own palettes lead, the
   * rest follow dimmed — a stable sort, not a filter, so nothing drops out.
   */
  const paletteChips = sortCurrentDesignFirst(palettes, design.slug).map((p) => {
    const dim = p.designSlug !== design.slug;
    if (dim) {
      return (
        <PaletteChip
          key={p.code}
          code={p.code}
          name={p.name}
          layers={p.layers}
          dim
          dimDesignName={designLabel(p.snapshot, locale) ?? p.designSlug}
          onDelete={() => deletePalette(p.code)}
        />
      );
    }
    const isActive = activePalette?.code === p.code;
    return (
      <PaletteChip
        key={p.code}
        code={p.code}
        name={p.name}
        layers={p.layers}
        active={isActive}
        brush={isActive}
        renaming={renamingPaletteCode === p.code}
        onSelect={() => paintWith(p.code)}
        onRenameStart={() => setRenamingPaletteCode(p.code)}
        onRenameConfirm={(next) => {
          renamePalette(p.code, next);
          setRenamingPaletteCode(null);
        }}
        onRenameCancel={() => setRenamingPaletteCode(null)}
        onDelete={() => deletePalette(p.code)}
      />
    );
  });

  /**
   * R5-PALETTES follow-up (TL, after PR 2) — step 3's whole job is naming
   * what's painting, and it said NOTHING when the on-screen config matched
   * no save: every ceramic added right then IS painted with those colours,
   * the bar just didn't say so. `activePalette` null means exactly "nothing
   * saved matches `configCode`" (same read as step 2's own `matchedPalette`
   * — card §4-bis, the URL is the one source of truth), so this chip covers
   * that gap with two states `PaletteChip` already has: `draft` (dashed,
   * "Unsaved", the colours' own label) because it isn't saved, `brush`
   * because it's what will paint. NOT `active` — that skin is a solid
   * `bg-card` + ring, and the ternary in palette-chip.tsx checks `active`
   * FIRST, so passing both would silently drop the dashed "unsaved" look
   * this chip exists to show. Deliberately NOT auto-saved on arrival (TL
   * ruling): the 10-slot LRU would burn a slot, and the name, on a palette
   * the customer never chose to keep — "Save as palette" below is the one
   * way this becomes a real entry.
   */
  const draftChip = !activePalette && (
    <PaletteChip
      key="draft"
      code={configCode}
      name={paintingLabel}
      layers={designLayers}
      draft
      brush
    />
  );

  /** Mirrors step 2's `saveDraftAsPalette` (configurator-client.tsx) — same
   *  builder inputs (`configCode`/`snapshot`/`designLayers` are this step's
   *  own server props, already the exact shape `buildConfigLinePayload`
   *  would produce), just no note/text ever enters a palette. `setActiveCode`
   *  here is a courtesy for immediacy; the reconciliation effect above would
   *  land on the same value a tick later regardless, once `activePalette`
   *  starts resolving through the freshly-saved code. */
  function saveDraftAsPalette() {
    const now = Date.now();
    savePalette({
      code: configCode,
      // `paintingLabel` at this call site IS `nameFor(...)` — this button
      // only renders when `!activePalette` (the same condition the draft
      // chip renders on), so the two never disagree.
      name: paintingLabel,
      designSlug: design.slug,
      snapshot,
      layers: designLayers,
      createdAt: now,
      usedAt: now,
    });
    setActiveCode(configCode);
  }

  /**
   * «+ New palette»: step 2 of the CURRENT design (`goToStep`, defined below,
   * keeps every other param — colours included, so this opens on what's on
   * screen right now, ready to tweak into something new rather than starting
   * from the design's own defaults).
   */
  const newPaletteChip = (
    <button
      type="button"
      data-testid="palette-chip-new"
      onClick={() => goToStep(2)}
      className="flex h-12 shrink-0 items-center gap-2.5 rounded-full border border-dashed border-primary/50 pl-1.5 pr-4 text-[13.5px] text-primary hover:bg-muted"
    >
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-full border border-dashed border-primary/60 text-lg leading-none"
      >
        +
      </span>
      {tPaletteBar("new")}
    </button>
  );

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
  /** R4-SCONTI: the id of the line the toast is confirming, so it can name that
   *  line's percentage. Read at RENDER time, not in the handler: `discount` is
   *  recomputed from the new cart on the next render, so in the handler it
   *  still describes the basket as it was BEFORE the add. */
  const [addedLineId, setAddedLineId] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** ③: the post-add panel, or null. Holds what the add was, so the
   *  confirmation keeps naming it while the stepper has already restarted. */
  const [added, setAdded] = useState<{ qty: number; name: string } | null>(null);
  const [addedOpen, setAddedOpen] = useState(false);
  const [qty, setQty] = useState(1);
  /** The two mounted column baskets (mobile in-flow + desktop rail): the
   *  sticky bar focuses the first unpainted row of whichever is on screen. */
  const mobileBasketRef = useRef<BasketHandle>(null);
  const desktopBasketRef = useRef<BasketHandle>(null);
  /**
   * Task 4 — `focusFirstUnpaintedRow` is scoped to a basket now (the drawer
   * mounts a third copy of the same rows in task 5, and "the visible one" is
   * no longer an answer once the drawer sits OVER step 3). The step's own
   * bar still wants whichever of its two copies is on screen, so it asks
   * them in order: each returns false when it has no visible unpainted row.
   */
  const focusFirstUnpainted = useCallback(() => {
    for (const r of [mobileBasketRef, desktopBasketRef]) {
      if (r.current?.focusFirstUnpainted()) return;
    }
  }, []);
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

  /**
   * R4-UPSELL-MODALE: same two lookups the cart context builds for the
   * existing suggestion feature (`cart-context.tsx`) — not a second
   * implementation. `supplierOf` reads a real cart line's own field.
   * `supplierOfProduct` covers a product that is not a cart line yet: every
   * product in `products` already belongs to `design.supplierId` (the step is
   * filtered to one supplier before it renders), so that answers the OPEN
   * product directly; a rule's `suggested` card carries its own supplier for
   * everything else (mirrors cart-context's `supplierOfProduct`).
   */
  const supplierOf = useCallback(
    (lineId: string) => cart.find((l) => l.id === lineId)?.supplierId ?? null,
    [cart]
  );
  const supplierOfProduct = useCallback(
    (productId: string) =>
      products.some((p) => p.id === productId)
        ? design.supplierId
        : (discountConfig.rules.find((r) => r.suggested?.id === productId)?.suggested
            ?.supplierId ?? null),
    [products, design.supplierId, discountConfig.rules]
  );

  /**
   * R4-FIX Ⓔ / D3 — the suggested ceramic must belong to the DONOR design's
   * whitelist, and the donor can be a line of another design sitting in the
   * basket: only the cart knows those whitelists (`cart-context`). The
   * exception is the projected line of `unlocksAnything`, which is not in the
   * cart at all and wears the design on screen — `products` IS that whitelist.
   */
  const allowedProduct = useCallback(
    (fromLineId: string, productId: string) =>
      cart.some((l) => l.id === fromLineId)
        ? cartAllowedProduct(fromLineId, productId)
        : products.some((p) => p.id === productId),
    [cart, cartAllowedProduct, products]
  );

  const discountLines: DiscountLineInput[] = useMemo(
    () =>
      cart.map((l) => ({
        id: l.id,
        productId: l.productId,
        unitPriceCents: l.unitPriceCents,
        currency: l.currency,
        quantity: l.quantity,
        dealRuleId: l.dealRuleId,
        // R5-UNPAINTED: DiscountLineInput.configCode is string|undefined,
        // never null — an unpainted line still counts for its quantity tier,
        // it just has no design to match a suggestion donor on.
        configCode: l.configCode ?? undefined,
      })),
    [cart]
  );

  /**
   * R4-UPSELL-POST-ADD ③ — the offers the basket unlocks RIGHT NOW.
   *
   * `activeSuggestions` over the cart that actually exists, not a projection at
   * a quantity the customer has not committed to: by the time this panel opens
   * the base is in the basket, so the engine's own answer is the whole answer
   * and the sheet's old hypothetical line has nothing left to model.
   *
   * Not `useCartContext().suggestions`, which is the same call minus the cart
   * drawer's ✕: dismissing the drawer's block must not silence this panel — the
   * two surfaces answer different gestures.
   *
   * The two guards are the ones the sheet's projection used to apply: a rule
   * with no resolvable card cannot be drawn, and a rule the shop configured to
   * pay nothing (`discountMode: "none"`, or "inherited" unreached) is not an
   * offer and must never read as one (F1).
   */
  const [takenRuleIds, setTakenRuleIds] = useState<string[]>([]);
  /** The last drawable version of each offer, so a card taken a moment ago can
   *  stay on screen with its own numbers once the engine stops returning it. */
  const seenOffers = useRef<Map<string, ActiveSuggestion>>(new Map());

  const addedOffers: ActiveSuggestion[] = useMemo(() => {
    const live = activeSuggestions(discountLines, discountConfig, {
      supplierOf,
      supplierOfProduct,
      allowedProduct,
      currentConfigCode: configCode,
    }).filter((s) => s.rule.suggested && s.pct > 0);
    for (const o of live) seenOffers.current.set(o.rule.id, o);

    // §D.2: a taken offer LEAVES the engine's list (D1: taken in full) but must
    // stay on screen, marked. It goes back in the admin's own rule order, not
    // at the end — the grid must not reshuffle under the customer's finger.
    const shown = new Set(live.map((o) => o.rule.id));
    const back = takenRuleIds
      .filter((id) => !shown.has(id))
      .flatMap((id) => seenOffers.current.get(id) ?? []);
    const rank = (o: ActiveSuggestion) =>
      discountConfig.rules.findIndex((r) => r.id === o.rule.id);
    return [...live, ...back].sort((a, b) => rank(a) - rank(b));
  }, [
    discountLines,
    discountConfig,
    configCode,
    supplierOf,
    supplierOfProduct,
    allowedProduct,
    takenRuleIds,
  ]);

  /**
   * ⚠️ §C — the scale counts CART + SELECTOR, not the selector alone. The
   * quantity discount aggregates per product across designs (`qtyByProduct`), so
   * with 6 plates already in the basket and 2 on the stepper the customer is at
   * 8, and the scale must say so. Counting the stepper alone would make it lie
   * to anyone who already has something in their basket.
   */
  const inCartQty = opened ? discount.qtyByProduct[opened.id] ?? 0 : 0;
  const ladderExcluded = Boolean(opened) && !included(opened?.id ?? null, discountConfig);
  const ladder = useMemo(
    () =>
      opened && discountConfig.tiersEnabled && !ladderExcluded
        ? ladderFor(inCartQty + qty, discountConfig.tiers)
        : null,
    [opened, discountConfig, ladderExcluded, inCartQty, qty]
  );

  // Focus restore on close lives in `ProductSheet` (§3.19 is its contract).

  function openProduct(id: string) {
    setOpenId(id);
    setSheet(true);
    setQty(1);
    setTakenRuleIds([]);
    seenOffers.current.clear();
  }

  // F37: current-config recap data (name + readable selections). Rendered only
  // when there are design layers (AC4: no config / ?set= landing → nothing).
  // ponytail: the box (and its "Edit colours ›") exists only for a REAL
  // choice — no explicit design ⇒ no box, not an empty one. The grid below
  // still works off the fallback design, which is fine as a catalog view.
  const hasConfig = hasExplicitDesign && designLayers.length > 0;

  /**
   * Tell the cart which configuration is on screen, so an offer borrows the
   * design the customer is actually looking at rather than the merely biggest
   * trigger line (TL ruling 2026-08-31). Cleared on unmount: in the drawer at
   * steps 1-2 there is no current configuration and the donor falls back to
   * quantity, exactly as before.
   *
   * R5-BASKET-HOST task 1: widened from a bare code to the full `CurrentConfig`
   * — the header drawer lives outside this subtree and cannot compute "what's
   * painting" itself, so the object it needs to render its own preview chip
   * has to travel through this same publish/clear channel the donor logic
   * already used.
   *
   * R5-BASKET-HOST task 4 — the ONE `CurrentConfig` this step builds: it is
   * both what the step PUBLISHES (for the header drawer, which lives outside
   * this subtree) and what it hands its own `<Basket>`. Built here rather
   * than read back out of the context on purpose — the context value only
   * lands after the publish effect, and the column would spend its first
   * frame rendering as if nothing were painting.
   */
  const currentConfig: CurrentConfig = useMemo(
    () => ({
      code: configCode,
      snapshot,
      layers: designLayers,
      designSlug: snapshot.designSlug,
      label: paintingLabel,
      explicit: hasConfig,
    }),
    [configCode, snapshot, designLayers, paintingLabel, hasConfig]
  );
  useEffect(() => {
    setCurrentConfig(currentConfig);
    return () => setCurrentConfig(null);
  }, [currentConfig, setCurrentConfig]);

  const count = hydrated ? itemCount(cart) : 0;
  /** R4-CTA-STICKY: the bar counts PIECES, not lines — a set is N deler. */
  const pieces = hydrated ? cartPieces(cart) : 0;
  /** R5-UNPAINTED task 9: the basket's own explanation box, mirroring the
   *  header marker (cart-menu.tsx) — pieces, not lines. */
  const unpaintedInBasket = hydrated ? unpaintedPieces(cart) : 0;
  /** Task 13: the order CTA and the checkout form both gate on this. */
  const hasUnpainted = unpaintedInBasket > 0;
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
  // R4-SCONTI fix-1: the sticky bar can be on screen at the same time as the
  // docked panel's totals (see the intersection-observer note above) — both
  // must read the same NET number, never the panel's net beside the bar's
  // gross.
  const stickyTotalSuffix = useShippingTotalSuffix(discount.total);
  /** R4-SCONTI: what the basket saves in total — tier and deal together. Taken
   *  from the engine (subtotal − total) rather than added up here, so the bar
   *  can never disagree with the drawer. */
  const barSaved = cartSaved(discount);
  /** The percentage of the line the toast is confirming, 0 when it has none. */
  const addedPct = addedLineId ? discount.perLine[addedLineId]?.pct ?? 0 : 0;

  /**
   * R4-UPSELL-MODALE: the ONE `NewCartLine` shape for the open product, shared
   * by «Add to basket» (V7) and «Add both» — the latter also uses it as the
   * bundle's donor line (ADR 0023 (e)), so a second, drifted construction here
   * would silently give the two buttons different lines.
   */
  function buildBaseLine(selected: CeramicProduct, quantity: number = qty): NewCartLine {
    // R5-PALETTES §4-bis: same dimensional attribute `CeramicCard` reads for
    // its own meta line — not re-derived, just formatted in both locales so
    // the cart row (read in either) never freezes into the add-time language.
    const size = publicAttributes(selected.attributes).find((a) => a.key !== "custom");
    return {
      productId: selected.id,
      productNameNo: selected.nameNo,
      productNameEn: selected.nameEn,
      supplierId: design.supplierId,
      supplierName: design.supplierName ?? "",
      unitPriceCents: selected.priceCents,
      currency: selected.currency,
      quantity,
      configCode,
      configSnapshot: snapshot,
      layers: designLayers,
      plateImage: selected.image
        ? assetUrl(selected.image, { width: PRODUCT_THUMB_WIDTH })
        : undefined,
      productSlug: selected.slug,
      pieces: selected.pieces,
      sizeLabelNo: size ? formatAttributeValue(size, "no") : undefined,
      sizeLabelEn: size ? formatAttributeValue(size, "en") : undefined,
    };
  }

  function addSelected(): string | null {
    const selected = opened;
    if (!selected) return null;
    add(buildBaseLine(selected));
    setQty(1);
    // Same identity addToCart() derives, so the toast can look the line up.
    return lineKey(selected.id, configCode);
  }

  /** §3.20: add → close the sheet FIRST, then show the toast. */
  function showAddedToast(lineId: string | null) {
    setAddedLineId(lineId);
    setSheet(false);
    setToast(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(false), 1800);
  }

  /**
   * ③ — would this add unlock anything?
   *
   * Answered BEFORE the add, on the basket the add is about to produce: `add()`
   * is a state update, so asking afterwards would mean asking on the next
   * render and threading the question through an effect. The projection is the
   * engine's own answer over `cart + the line being added` — the same shape the
   * product sheet used to build for its offer block, and the same lines the
   * cart will hold a tick later (the engine totals per product, so whether the
   * add merges into an existing row changes nothing here).
   */
  function unlocksAnything(selected: CeramicProduct, quantity: number): boolean {
    const candidateId = lineKey(selected.id, configCode);
    const projected: DiscountLineInput[] = [
      ...discountLines,
      {
        id: candidateId,
        productId: selected.id,
        unitPriceCents: selected.priceCents,
        currency: selected.currency,
        quantity,
        configCode,
      },
    ];
    return (
      activeSuggestions(projected, discountConfig, {
        // The projected line is not a cart line yet, so the real `supplierOf`
        // legitimately misses for it — fall back to the product-keyed lookup
        // only then, exactly as the sheet's projection did.
        supplierOf: (id) =>
          supplierOf(id) ?? (id === candidateId ? supplierOfProduct(selected.id) : null),
        supplierOfProduct,
        allowedProduct,
        currentConfigCode: configCode,
      }).filter((o) => o.rule.suggested && o.pct > 0).length > 0
    );
  }

  function addOpened() {
    // The sheet stays mounted (and its CTA clickable) through the 180-220ms
    // exit animation: without this a double-tap would add the product twice.
    if (!sheetOpenRef.current || !opened) return;
    // Read BEFORE the add: `addSelected` resets the stepper, and the panel
    // names what was actually added.
    const justAdded = { qty, name: locale === "no" ? opened.nameNo : opened.nameEn };
    const unlocked = unlocksAnything(opened, qty);
    const lineId = addSelected();
    setSheet(false);
    // §3.20 unchanged when the add unlocks nothing: the toast alone. When it
    // does, the panel IS the confirmation, so there is no toast to duplicate it.
    if (unlocked) {
      setAdded(justAdded);
      setAddedOpen(true);
    } else {
      showAddedToast(lineId);
    }
  }

  /**
   * ③ — taking one offer, from the panel.
   *
   * ONE case, where the sheet's block had two: the base is already in the
   * basket, so there is no bundle to assemble and no `baseQty` to compute —
   * `acceptSuggestion` adds the suggested ceramic alone, wearing the design of
   * the line that triggered the rule (ADR 0023 (e)).
   *
   * The panel STAYS OPEN (§D.2): the customer may want the other cards too.
   * Only «Fortsett å handle» (and ✕ / Esc / the backdrop) closes it.
   */
  function takeOffer(offer: ActiveSuggestion) {
    if (!offer.rule.suggested) return;
    if (takenRuleIds.includes(offer.rule.id)) return; // a reflex second tap
    acceptSuggestion(offer);
    setTakenRuleIds((ids) => [...ids, offer.rule.id]);
    setToast(true);
    setAddedLineId(null); // the offer's own line, not the base: no tier to name
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

  // ── The step's own half of the basket footer (`footerSlot`) ──
  // The two low pills navigate THIS step (a new design, the share link)
  // and the feedback belongs to `shareState`, which stays here — so they
  // are handed to `<Basket>` as a slot rather than moved into it.
  const cartFooter = (
    <>
      {/* R4-BTN-SCALE AC4: le due azioni basse sono un GRUPPO, non
          due pari del primario. Wrapper `gap-2` dentro il `gap-3`
          dello stack → ritmo a due livelli: 12px staccano «Bestill»,
          8px tengono insieme queste due. Taglia `sm` (mockup
          vincolante): il primario resta 72px contro i loro ~51, cioè
          1,4× — la gerarchia si legge anche in bianco e nero, non
          solo dal colore. */}
      <div className="flex flex-col gap-2">
        <NextStepPill
          variant="secondary"
          size="sm"
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
          size="sm"
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
      </div>
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
  );

  // ── Docked cart panel (shared by desktop right column + mobile inline
  // section). R5-BASKET-HOST task 4: the panel itself is `<Basket>` now
  // (components/ui-domain/basket.tsx) — the header drawer mounts the very
  // same component in task 5. Two copies live in this tree, `md:hidden` and
  // `hidden md:block`, each with its own state; only one is ever visible.
  const cartPanel = (host: "mobile" | "desktop") => (
    <Basket
      ref={host === "mobile" ? mobileBasketRef : desktopBasketRef}
      host="column"
      currentConfig={currentConfig}
      footerSlot={cartFooter}
    />
  );


  // R5-PALETTES task 9: the desktop "Ditt valg" box is GONE — the PaletteBar
  // above the step now says which palette is painting (mockup `#s3a`'s option
  // A carries no such card in the basket column; the bar replaces it).
  //
  // R5-PALETTES task 13: the mobile strip below WAS that box's phone twin
  // (design + selected options, an "Edit" shortcut) — it becomes the
  // mockup's `MobStrip` instead: the bar's own job (name what's painting),
  // not the design's.
  //
  // Fix wave PR3 finding 4: no `hasConfig` gate any more. That gate made
  // sense while this was a recap of an explicit choice (AC4); now it's the
  // ONLY mobile way to see what's painting and reach the sheet, and the
  // desktop `PaletteBar` a few hundred lines down carries no such gate
  // either — it always renders, just `hidden` below `md`. A bare `?step=3`
  // or a `?set=` landing still has SOME palette painting (`paintingLabel`
  // already falls back to `designName`), and the phone customer deserves to
  // be told, and given the sheet, same as desktop.
  //
  // TL "menu sopra come step3" (PR3 round 3): step 2 grew this exact same
  // strip, so the markup/behaviour now lives once in `<PaintingStrip>`
  // (components/ui-domain/painting-strip.tsx) — this call site only supplies
  // step 3's own values (`design.slug`, `activePalette`, `paintWithFromSheet`
  // …); the strip's own WHY (the full-bleed trick, `sticky top-14`, the
  // `SheetTrigger` reasoning) lives in that file now, not duplicated here.
  const paintingStrip = (
    <PaintingStrip
      testId="step3-your-selection-strip"
      designLayers={designLayers}
      paintingLabel={paintingLabel}
      designName={designName}
      palettes={palettes}
      currentDesignSlug={design.slug}
      activeCode={activePalette?.code ?? null}
      draft={!activePalette}
      locale={locale}
      onPick={paintWithFromSheet}
      onNewPalette={() => {
        setPaletteSheetOpen(false);
        goToStep(2);
      }}
      onSaveDraft={() => {
        saveDraftAsPalette();
        setPaletteSheetOpen(false);
      }}
      // PR3 round 2: the sheet gained rename/delete (it had neither) so it
      // can do what the removed step-2 tab's chips did, now that step 2
      // opens this SAME sheet too. `renamingPaletteCode`/`renamePalette`/
      // `deletePalette` already exist in this file — the desktop bar's own
      // `paletteChips` a few hundred lines down already wire them the same
      // way, this is the sheet's equivalent, not a new mechanism.
      renamingCode={renamingPaletteCode}
      onRenameStart={(code) => setRenamingPaletteCode(code)}
      onRenameConfirm={(code, name) => {
        renamePalette(code, name);
        setRenamingPaletteCode(null);
      }}
      onRenameCancel={() => setRenamingPaletteCode(null)}
      onDelete={(code) => deletePalette(code)}
      open={paletteSheetOpen}
      onOpenChange={setPaletteSheetOpen}
    />
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
  //
  // Fix wave PR3 finding 10: `!paletteSheetOpen` joins `!sheetOpen` for the
  // exact same reason stated above (the file's own rule) — the palette
  // sheet is a second fixed bottom layer just like the product sheet, and
  // was the one case this line forgot to name.
  const showStickyBar = count > 0 && !sheetOpen && !paletteSheetOpen;
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
          {formatMoney(discount.total, locale)}
          {stickyTotalSuffix}
        </p>
        {/* R4-SCONTI: the total above is already NET, so without this line the
            bar quietly shows less than the rows add up to and the customer only
            finds out by opening the drawer — after deciding. A discount found
            after the decision is a refund, not an incentive.
            Rendered ONLY when there is something to declare, so with no
            discount the bar keeps exactly the height it has today. It sits on
            its OWN line rather than beside the total: `stickyTotalSuffix`
            («+ frakt») already lives up there, and at 360 in English the two
            would collide. */}
        {barSaved.amountCents > 0 && (
          <p
            data-testid="sticky-bar-saved"
            className="truncate text-[11px] font-medium tabular-nums"
            style={{ color: "color-mix(in oklab, var(--discount), black 34%)" }}
          >
            {tc("stickyBar.saved", { amount: formatMoney(barSaved, locale) })}
          </p>
        )}
      </div>
      {/* Same pill as the cart panel's CTA (§3.16) and the same label key, so
          R-PAY reskins both from one place. It carries the arrow because it
          DOES advance the funnel — see the e2e note in r-extra-pill.
          Fix round 1: `hasUnpainted` reskins it exactly like the panel's own
          primary pill (tertiary, `unpainted.cta`, no arrow — this tap does
          NOT send the order) and its `onClick` stops touching `checkoutOpen`
          entirely. Before this fix, tapping it while unpainted did
          `flushSync(() => setCheckoutOpen(true))`, which the panel's own
          `!hasUnpainted && checkoutOpen` gate stops from ever mounting the
          form — but `stickyBar` below is gated on `!checkoutOpen`, so the
          bar hid itself with nothing to show for it, AND `checkoutOpen`
          stayed stuck `true` forever (both `setCheckoutOpen(false)` call
          sites live inside the branch this state can never reach), so the
          form popped open unprompted the moment the last piece got
          painted. */}
      <NextStepPill
        data-testid="sticky-bar-checkout"
        className="shrink-0"
        variant={hasUnpainted ? "tertiary" : "primary"}
        label={hasUnpainted ? t("unpainted.cta", { count: unpaintedInBasket }) : to("title")}
        arrow={!hasUnpainted}
        onClick={() => {
          if (hasUnpainted) {
            focusFirstUnpainted();
            return;
          }
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
          hasUnpainted ? (
            <PillIcon variant="tertiary">
              <Brush className="size-5 text-muted-foreground" />
            </PillIcon>
          ) : (
            <PillIcon>
              <Truck className="size-5 text-primary" />
            </PillIcon>
          )
        }
      />
    </div>
  );

  return (
    <div
      data-testid="ceramics-step"
      className={cn(
        // The bar is `fixed`, so it sits ON the page: without this the last rows
        // of the order block stay under it and the CTA is unreachable.
        showStickyBar && "pb-24 md:pb-0",
        // Fix wave B finding 5 (minor) — same gap as step 2's own
        // `data-testid="configurator"`: no `scroll-margin-top` anywhere, so a
        // keyboard-focused control lands under this step's own sticky
        // `PaletteBar` (69px, desktop only).
        "md:[&_*:focus-visible]:scroll-mt-[69px]"
      )}
    >
      {/* R5-PALETTES task 9: the paint-mode bar, desktop only — mobile gets
          its own "Painting with" strip + sheet, same split step 2 makes
          (task 8). `-mt-7` cancels `main`'s own top padding (public-shell.tsx)
          so the bar sits flush under the header before any scroll, and
          `sticky top-0` (not `top-14` — see palette-bar.tsx) pins it once
          scrolled, because the desktop site header isn't sticky at all
          (site-header.tsx:15). The HORIZONTAL full-bleed (PR3 fix — the bar
          used to stop short of the viewport edges, capped at `main`'s own
          `max-w-[1060px]`) is now owned by `PaletteBar` itself
          (`md:w-screen md:ml-[calc(50%-50vw)]`) — no `-mx-5` needed here,
          it only ever cancelled `main`'s padding, not its width cap. The
          classes land on `PaletteBar` itself via `className`, not a wrapper:
          a sticky element only stays pinned as long as its OWN parent is
          taller than it is, and that parent here is this whole step
          (`data-testid="ceramics-step"`), not a div sized to just the bar. */}
      <PaletteBar
        mode="paint"
        draft={!activePalette}
        sticky
        className="hidden md:-mt-7 md:mb-6 md:block"
        chips={
          <>
            {draftChip}
            {paletteChips}
            {newPaletteChip}
          </>
        }
        extra={
          // Same rule as step 2's own "Save as palette" (configurator-client.tsx):
          // only when the draft matches no save — once it's saved, `activePalette`
          // resolves and the draft chip (and this button) both go away together.
          !activePalette && (
            <button
              type="button"
              onClick={saveDraftAsPalette}
              className="ml-auto flex h-12 shrink-0 items-center gap-2 rounded-full border-2 border-primary bg-primary/10 px-5 text-[13.5px] font-semibold hover:bg-primary/20"
            >
              {tPaletteBar("save")}
            </button>
          )
        }
      />

      {/* Fix wave PR3 finding 7: the mockup (`Phone3`) puts `MobStrip`
          directly under the header, above the "Step 3 of 3" kicker — this
          used to render inside the left column, below both the stepper and
          the `<h2>`. For a `sticky` element DOM order IS scroll order, so
          that wasn't cosmetic: it mirrors the desktop `PaletteBar` right
          above (also ahead of the nav cluster), and doesn't fight anything
          here — the nav cluster and shared-set banner below are ordinary
          in-flow siblings, no sticky/z-index of their own to collide with. */}
      {paintingStrip}

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
            {cartPanel("mobile")}
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
            Update this if that heading block changes.
            R5-PALETTES task 9: `top-4` (1rem) is now BELOW the sticky
            PaletteBar's own pinned height — without the offset this
            panel would slide up under the bar instead of stopping clear of
            it, the same "second sticky bug" task 8's report fixed for step
            2's canvas. `calc(69px+1rem)` keeps the original 1rem breathing
            room, just measured from the bar's bottom edge (68px content +
            1px `border-b`, fix-wave finding 5), not the viewport top. */}
        <div
          className="hidden min-w-0 rounded-sm border border-border bg-card p-5 md:mt-16 md:block md:sticky md:top-[calc(69px+1rem)] md:self-start"
          data-testid="docked-cart-panel"
        >
          {cartPanel("desktop")}
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
        ladder={ladder}
        ladderExcluded={ladderExcluded}
        inCartQty={inCartQty}
      />

      {/* ③: the second half of the add — the sheet closed, this opened. Two
          dialogs in sequence, never one inside the other. `added` outlives
          `addedOpen` so the panel can play its exit animation. */}
      {added && (
        <AddedSheet
          open={addedOpen}
          onOpenChange={setAddedOpen}
          addedQty={added.qty}
          addedName={added.name}
          offers={addedOffers}
          takenRuleIds={takenRuleIds}
          onTake={takeOffer}
          locale={locale}
        />
      )}

      {/* R5-PALETTES task 13's `PaletteSheet` moved into `paintingStrip`
          itself (fix wave PR3 finding 9) — it now renders its own trigger
          via `SheetTrigger`, which only wires focus-restore correctly when
          `Trigger` and `Content` share one `<Sheet>` root positioned where
          the trigger button actually lives, not down here as a second,
          disconnected instance. */}


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
            {/* R4-SCONTI: the toast lands in the instant AFTER the decision, so
                it is the cheapest place to say the discount applied — one
                string, no layout. Silent when the line has none, so an
                undiscounted add reads exactly as it does today. */}
            {addedPct > 0 ? t("addedWithPct", { pct: addedPct }) : t("added.title")}
          </span>
        )}
      </div>
    </div>
  );
}
