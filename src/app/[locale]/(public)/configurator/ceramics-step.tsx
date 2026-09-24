"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Stepper, STEP_NAV_STICKY } from "@/components/ui-domain/stepper";
import { PaletteCard } from "@/components/ui-domain/palette-card";
import { paletteHexes, switchLane } from "@/components/ui-domain/palette-card-model";
import { PaletteChip } from "@/components/ui-domain/palette-chip";
import { PaintingStrip } from "@/components/ui-domain/painting-strip";
import { nameFor, paletteFor } from "@/lib/palettes/palettes";
import { paletteMatchingCode } from "@/lib/configurator/save-gate";
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
import { encodeSetParam, selectionCountOf, SET_LINK_BUDGET, stripCustomSegment } from "@/lib/cart/set-code";
import { designSegmentOf, encodeKitParam } from "@/lib/cart/kit-code";
import { openOnKitArrival } from "@/lib/cart/basket-open";
import {
  activeSuggestions,
  cartSaved,
  included,
  type ActiveSuggestion,
  type DiscountLineInput,
} from "@/lib/discounts/discount";
import { ladderFor } from "@/lib/discounts/ladder";
import { SetBadge } from "@/components/ui-domain/set-badge";
import {
  formatAttributeValue,
  publicAttributes,
  type TypedAttribute,
} from "@/lib/catalog/product-attributes";
import { groupBySeries } from "@/lib/configurator/product-series";
import { buildDesignSwitchParams } from "@/lib/configurator/design-switch-params";
import { ShoppingBag, Truck, ArrowUpRight, Brush } from "lucide-react";
import type { ResolvedSharedSet } from "./resolve-shared-set";
import { ProductSheet } from "@/components/ui-domain/product-sheet";
import { AddedSheet } from "@/components/ui-domain/added-sheet";
import { ShareDialog, type ShareKind } from "@/components/ui-domain/share-dialog";
import { KitStrip } from "@/components/ui-domain/kit-strip";
import { kitStripCounts } from "@/lib/cart/kit-label";
import { clearKitContext, kitTitle, readKitContext } from "@/lib/cart/kit-context";
import { DesignRound } from "@/components/ui-domain/design-round";
import { Basket } from "@/components/ui-domain/basket";
import { NextStepPill, PillIcon } from "@/components/ui-domain/next-step-pill";
import { useTour } from "@/lib/tour/use-tour";
import { isLastTip, tipFor } from "@/lib/tour/tour";
import { CoachBar, Hotspot, useTourTip } from "@/components/ui-domain/tour";

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
  // ponytail: optional prop so T3 compiles before T4/T6 wire it
  isAdmin = false,
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
  /** R5-KIT: real admin gate from the session (page.tsx), replaces `?admin=1`. */
  isAdmin?: boolean;
}) {
  const t = useTranslations("cart");
  // TODO:nb-review NO copy: step3.seriesCount · stickyBar.pieces · stickyBar.unpainted
  const tc = useTranslations("configurator");
  const to = useTranslations("order");
  const tPaletteCard = useTranslations("palettes.card");
  const locale = useLocale() as "no" | "en";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // isAdmin comes from the session via page.tsx (R5-KIT T3); no URL gate.

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
    /** Task 7 — the checkout view is a mode of THE basket and it names the
     *  host that opened it (`cart-context.tsx`). Below `lg` the bar's
     *  «Bestill» names the drawer, because the drawer is the only basket
     *  there is; `openCart` is the same opener the header button uses. */
    setCheckoutHost,
    openCart,
    /** R5-TUTORIAL: while the drawer is open its own `CoachBar` (kit3 only,
     *  `cart-menu.tsx`) takes over — the fixed one here never mounts on top
     *  of the sheet, in or out of kit-mode. */
    open: cartOpen,
    activeCode,
    setActiveCode,
    save: savePalette,
    touch: touchPalette,
    rename: renamePalette,
    removePalette: deletePalette,
  } = useCartContext();

  /**
   * R5-TEXT-CARRY — which palette is painting: the saved palette whose CODE
   * (`configCode`, a server prop derived from the URL) matches EXACTLY, same
   * rule as step 2's own `matchedPalette` (card §4-bis: the active palette
   * IS the URL). The dedication rides inside the code (`config-code.ts`),
   * so a different dedication IS a different identity — an unsaved draft —
   * and Save is offered (see `canSaveDraft` below).
   */
  // (It used to be `rowThumb` that forced it up here; that moved to
  // `basket.tsx` in task 4 and these two kept it where it is.)
  const designName = designLabel(snapshot, locale) ?? design.name;
  const activePalette = paletteMatchingCode(
    palettes,
    configCode,
    design.slug
  );
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
  // R5-TEXT-CARRY — `activePalette` above is already an exact-code match,
  // so inheriting its name is inheriting the name of the palette whose
  // words these also are: no other dedication of the same colours can reach
  // this branch. The fallback still names a fresh unsaved draft from the
  // colours alone (`stripCustomSegment` — the name is noise, TL ruling —
  // same colours, same name, whatever is typed).
  const paintingLabel =
    activePalette?.name ??
    nameFor(
      // TL ruling (R5-TEXT-IDENTITY, "the name is noise"): the name is a
      // function of the COLOURS, never the words — `nameFor` hashes
      // whatever code it's given, so an unstripped code renamed the palette
      // on every keystroke into the dedication field. Same
      // `stripCustomSegment` everything else already strips with (no
      // second stripping helper) — `code` keeps the inscription for
      // identity/Paint, only the NAME's input is colours-only.
      //
      // fix 3: `snapshot.selections.length` counts a zero-option category
      // (Krabbe's empty «Tekst») that never became a code segment
      // (`toCodecDesign` drops it) — the count was one too high, so
      // `stripCustomSegment` silently gave up, and the un-stripped code
      // renamed the palette on every keystroke. `codecCategoryCount` is
      // the right count, but it needs a `DesignDetail`-shaped object this
      // component doesn't have (only `design: DesignRef`, no categories) —
      // `selections` was already built one entry per category
      // (`line-payload.ts`), so filtering out the blank one (`option: ""`,
      // exactly what a category with no options to pick from produces) is
      // the same count without threading a new prop through.
      stripCustomSegment(
        configCode,
        snapshot.selections.filter((s) => s.option).length
      ),
      snapshot,
      paletteWords,
      palettes.map((p) => p.name)
    ) ??
    designName;
  /**
   * R5-TEXT-CARRY — the draft tile shows the on-screen snapshot's own
   * words, ALWAYS: the draft branch renders only while `activePalette` is
   * null, i.e. while no saved palette shares this code — there is no saved
   * palette whose words these could borrow. (The old colours-match could
   * show the field over a saved palette's stored words; that state no
   * longer exists.) `snapshot` (this step's own prop) already IS what's on
   * screen right now, always. (A saved palette's OWN chip, in the lane
   * below, still reads its own stored `p.snapshot.customText` — that tile
   * describes THAT palette, not the canvas.)
   */
  const currentDedication = snapshot.customText;

  /**
   * R5-TEXT-CARRY — same rule as step 2's own `canSaveDraft`
   * (configurator-client.tsx): the old card §3 guard (withhold the Save
   * while the draft's COLOURS already matched a save, dedication aside) is
   * gone with `draftMatchesSavedColours`. A different dedication IS a
   * different palette, unsaved, so Save is offered; the only already-saved
   * draft is the exact one, where saving is a no-op anyway (`savePalette`
   * dedups by exact code, LRU 10 unchanged).
   */
  const canSaveDraft = !activePalette;

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
    // and set=/origin=set (the shared-set banner), silently losing the
    // customer's own words and the shared basket on every chip tap.
    // R5-TEXT-IDENTITY final-review round 2 (finding 5a — this comment used
    // to claim `note=`/`text=` were "the ONLY carrier for both at step 3",
    // which stopped being true for `text=` once the code itself started
    // carrying the inscription (task 4; `page.tsx` seeds the field from a
    // decoded `?code=` when `?text=` is absent). `note=` is still the ONLY
    // carrier for the colour wish — the code only ever holds a non-reversible
    // hash of it, never the words themselves.
    //
    // R5-TEXT-CARRY — the recall must start from the SNAPSHOT, not the
    // field: `page.tsx` seeds the field from the tapped chip's code, but
    // only when `text=` is ABSENT. A `text=` left over from an earlier edit
    // would win outright as the "live edit" and cover the recalled
    // palette's own words with the stale ones — so it is dropped here,
    // exactly like step 2's `loadPalette` drops it. `note=` stays for the
    // reason above (the wish's words travel no other way).
    //
    // R5-DESIGN-SWITCH AC4 (fix round 1): a dim chip's code belongs to
    // ANOTHER design — resolve `designSlug` from the tapped palette's own
    // store-written field (`paletteFor`), same source the lane's `dim`
    // already reads, and set `design=` upfront via `buildDesignSwitchParams`
    // (like step 2's `loadPalette`). Without it `page.tsx` kept the stale
    // `?design=` (`chosen ?? codeDesign`) and never switched on a dim tap.
    // A code that resolves to nothing keeps the old behaviour (only `code=`,
    // the tolerant decode handles the rest).
    const designSlug = paletteFor(palettes, code)?.designSlug ?? null;
    const params = buildDesignSwitchParams(searchParams, code, designSlug);
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

  // R5-NEW-PALETTE: pure switch targets — no active state, no badge, no
  // aria-current; the painting palette is the NowBlock above, not a chip (DS §3.31). A dim
  // chip IS tappable (R5-DESIGN-SWITCH: the tap switches design too via
  // `?code=`), so the other design's name stays as its subtitle.
  const switchChips = switchLane(palettes, activePalette?.code ?? null, design.slug).map((p) => {
    const dim = p.designSlug !== design.slug;
    return (
      <PaletteChip key={p.code} code={p.code} name={p.name} compact
        dedication={p.snapshot.customText} layers={p.layers}
        dim={dim} dimDesignName={dim ? designLabel(p.snapshot, locale) ?? p.designSlug : undefined}
        onSelect={() => paintWith(p.code)} />
    );
  });

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

  /** «Edit colours ›»: does not create anything — step 2 of the current design with the colours on screen (goToStep keeps params and code). DS §3.31. */
  // TODO:nb-review — `palettes.card.editColours` NO copy is new ("Rediger farger"), unreviewed.
  const editColoursButton = (
    <button type="button" data-testid="palette-card-edit" onClick={() => goToStep(2)}
      className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-dashed border-primary/50 px-3 text-[12px] font-medium text-primary hover:bg-primary/10">
      {tPaletteCard("editColours")}<span aria-hidden>›</span>
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
  // R4-SCONTI fix-1: the bar and a basket's own totals can be on screen at
  // the same time (at 768 the bar is up and the drawer can be open over it),
  // so both must read the same NET number — never a panel's net beside the
  // bar's gross. (The intersection-observer this used to point at went with
  // the in-flow mobile copy in task 6.)
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
  // always produce the link on screen, clipboard is a bonus
  // (clipboard throws NotAllowedError in plenty of real contexts).
  async function buildShareUrl(kind: ShareKind): Promise<string | null> {
    setShareState(null);
    let query: string;
    if (kind === "kit") {
      const segment = configCode ? designSegmentOf(configCode) ?? "" : "";
      const param = encodeKitParam(
        segment,
        cart.map((l) => ({ productSlug: l.productSlug, quantity: l.quantity }))
      );
      if (!param) {
        // only legacy rows (no productSlug) → nothing can travel in the link
        setShareState({ kind: "none" });
        return null;
      }
      query = `?step=2&kit=${param}`;
    } else {
      // R5-TEXT-IDENTITY task 3: strip each line's inscription/colour-wish
      // segment before it enters the link — selectionCountOf reads it off the
      // line's OWN snapshot, no design/catalog lookup needed.
      const param = encodeSetParam(
        cart.map((l) => ({
          configCode: l.configCode,
          productSlug: l.productSlug,
          quantity: l.quantity,
          selectionCount: selectionCountOf(l.configSnapshot),
        }))
      );
      if (!param) {
        // only legacy rows (no productSlug) → nothing can travel in the link
        setShareState({ kind: "none" });
        return null;
      }
      query = `?step=3&set=${param}`;
    }
    const url = `${window.location.origin}${window.location.pathname}${query}`;
    if (url.length > SET_LINK_BUDGET) {
      // decision 5: silent budget check — overflow is academic, just say so
      setShareState({ kind: "tooBig" });
      return null;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareState({ kind: "copied", url });
    } catch {
      // clipboard blocked → still show the link for manual copy
      setShareState({ kind: "manual", url });
    }
    return url;
  }

  const [shareOpen, setShareOpen] = useState(false);
  const sharePrice = formatMoney(discount.total, locale);
  const sharePieces = cartPieces(cart);
  const shareKitThumb = cart.find((l) => l.plateImage)?.plateImage ?? null;

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

  // R5-KIT fix 8: the strip reads the persisted shop-window context (label +
  // image saved at the step-2 apply). Lazy state: storage only, never per
  // render. No match (hand-made link) → generic fallback + design thumb.
  // fix 9 (was missing): setKitCtx on clear — otherwise the title/thumb stay
  // stale after completion.
  const [kitCtx, setKitCtx] = useState(() => readKitContext());
  const kitClearedRef = useRef(false);
  const tKit = useTranslations("kit");
  const kitShownTitle = kitTitle(kitCtx, locale, tKit("strip.title"));
  // R5-KIT T6: kit-mode (mirror of origin=set) — survives refresh and
  // goToStep (which copies every param), dies with selectDesign (there is no
  // switch in kit-mode anyway) AND when everything is painted (fix 11: the
  // kit's job is done → no strip, no auto-open). Opens the existing drawer
  // once on arrival.
  const kitMode =
    searchParams.get("origin") === "kit" &&
    (!hydrated || unpaintedPieces(cart) > 0);
  // fix 11: everything painted → clear the persisted context once.
  useEffect(() => {
    if (
      !hydrated ||
      kitClearedRef.current ||
      searchParams.get("origin") !== "kit" ||
      unpaintedPieces(cart) > 0
    ) {
      return;
    }
    kitClearedRef.current = true;
    clearKitContext();
    setKitCtx(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot clear on completion
  }, [hydrated, cart]);
  const kitOpenedRef = useRef(false);
  useEffect(() => {
    if (!kitMode || !hydrated || kitOpenedRef.current) return;
    kitOpenedRef.current = true;
    if (
      openOnKitArrival({
        kitMode,
        unpainted: unpaintedPieces(cart),
        wide: window.matchMedia("(min-width: 1024px)").matches,
      })
    ) {
      openCart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot open on arrival
  }, [kitMode, hydrated]);

  // R5-TUTORIAL — same `tipFor` (pure, tour.ts) steps 1-2 use; step 3 is the
  // only page that ever has a `setBanner`, so it's the only caller that
  // passes a real value for it (AC3: a set landing shows nothing). No
  // `KitWelcome` on this page, so `welcomeOpen` is always false here.
  const tour = useTour();
  const tip = tipFor({
    state: tour.state,
    hydrated: tour.hydrated,
    kitMode,
    welcomeOpen: false,
    setBannerOpen: setBanner !== null,
    step: 3,
  });
  // `unpaintedPieces`, not the kit's total: kit3.1 says "these {count} pieces
  // have no colours yet" — as rows get painted, that count should shrink.
  // `saved` (palettes.length) feeds step3.1's/kit3's-2nd-tip's plural — the
  // SAME expression the `PaletteCard`'s own `saved` prop already uses below.
  const tourTip = useTourTip(tip, { count: unpaintedPieces(cart), saved: palettes.length });
  const handleTourNext = () => {
    if (!tip || !tourTip) return;
    if (tourTip.last) tour.turnOff();
    else tour.next(tip.sequence);
  };
  // R5-TUTORIAL round 2 (plan Task B) — the LAST tip of step3/kit3 ("pick
  // your ceramics" / "want more? tap a ceramic") is the one this page adds
  // active guidance to: it already anchors to `ceramics-grid` (below), so
  // "the right action" IS the anchor itself — pulse it, no separate target
  // to find. `isLastTip` is the same rule `tour.ts` uses to decide Next vs
  // Done, reused here rather than re-deriving "is this the grid's tip".
  // There is no standing "add to cart" control on this page before a
  // product sheet is open (the sheet's own `data-testid="add-to-cart"`,
  // product-sheet.tsx:401, doesn't exist yet at this point) — grepped, not
  // guessed; the grid is the closest real "right action" to point at
  // pre-click.
  const ceramicsGridRef = useRef<HTMLDivElement>(null);
  const [pulseGrid, setPulseGrid] = useState(false);
  const handleTourHighlight = () => {
    if (!tip || !isLastTip(tip)) return;
    // Daniele (live test, round 4→5): scrolling on Done was jarring even with
    // a "fully visible" gate — the grid is taller than the viewport so that
    // gate was almost always false. Stay put; the pulse is enough.
    setPulseGrid(true);
    window.setTimeout(() => setPulseGrid(false), 2000);
  };

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
      <div className="flex flex-col gap-2">
        {/* R5-KIT T4: one Share button opens the set-or-kit dialog. The gate
            is the admin session (page.tsx prop), never the URL. */}
        {isAdmin && (
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
            onClick={() => {
              setShareState(null);
              setShareOpen(true);
            }}
          />
        )}
      </div>
      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        onPick={buildShareUrl}
        shareState={shareState}
        price={sharePrice}
        pieces={sharePieces}
        designLayers={designLayers}
        kitThumb={shareKitThumb}
        notShareable={notShareable}
      />
    </>
  );

  // ── Docked cart panel (the desktop right column). R5-BASKET-HOST task 4:
  // the panel itself is `<Basket>` now (components/ui-domain/basket.tsx),
  // and task 5 mounts the very same component in the header drawer.
  //
  // Task 6: the in-flow mobile copy is GONE. Below `lg` the basket is the
  // drawer, full stop — so this tree mounts ONE `<Basket>` (the column) and
  // the header's drawer mounts the other. Most of their state is
  // per-instance (`expandedId`, `pickerOpenId`, `unpaintId`, `openPhotoId`),
  // but four things are NOT: `checkoutHost`, `rowPaletteCode`, `paintN` and
  // `currentConfig` live in `cart-context.tsx`, one per CART. Keep that in
  // mind before adding anything shared: a plain `checkoutOpen` boolean there
  // rendered an `<OrderForm>` — and a `<Turnstile>` — in every mounted copy
  // at once, which is why it names its host now.
  const cartPanel = (
    <Basket
      host="column"
      currentConfig={currentConfig}
      footerSlot={cartFooter}
    />
  );


  // R5-PALETTES task 9: the desktop "Ditt valg" box is GONE — the PaletteCard
  // above the step now says which palette is painting (mockup `#s3a`'s option
  // A carries no such card in the basket column; the card replaces it).
  //
  // R5-PALETTES task 13: the mobile strip below WAS that box's phone twin
  // (design + selected options, an "Edit" shortcut) — it becomes the
  // mockup's `MobStrip` instead: the bar's own job (name what's painting),
  // not the design's.
  //
  // Fix wave PR3 finding 4: no `hasConfig` gate any more. That gate made
  // sense while this was a recap of an explicit choice (AC4); now it's the
  // ONLY mobile way to see what's painting and reach the sheet, and the
  // desktop card further down carries no such gate either — it always
  // renders, just `hidden` below `md`. A bare `?step=3`
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
      dedication={currentDedication}
      textPosition={snapshot.textPosition}
      designName={designName}
      palettes={palettes}
      currentDesignSlug={design.slug}
      activeCode={activePalette?.code ?? null}
      draft={!activePalette}
      canSaveDraft={canSaveDraft}
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
      // `deletePalette` already exist in this file — the desktop card's own
      // `switchChips` a few hundred lines down already wire them the same
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
      // Fix wave — mobile twin of the desktop `Hotspot` a few hundred lines
      // down on `PaletteCard`'s "now" block: same tip, same condition,
      // pulsing the "Palettes ▾" trigger instead since there's no anchored
      // badge below `md`.
      tourPulse={Boolean(
        tourTip &&
          tip &&
          ((tip.sequence === "step3" && tip.n === 1) ||
            (tip.sequence === "kit3" && tip.n === 2))
      )}
    />
  );

  // ── R4-CTA-STICKY: the order bar ─────────────────────────────────────────
  // R5-BASKET-HOST task 7: below `lg` this bar IS the basket — the only way
  // to reach the rows, since task 6 took the column away. So it says what
  // the basket holds («Basket · N pieces · k unpainted · NOK …») and its
  // whole left side is the button that opens the drawer. No handle and no
  // «▴»: nothing is dragged any more.
  //
  // Self-gates on THREE things, all required by the card: below `lg`
  // (`lg:hidden`), a non-empty basket, and no product/palette sheet open —
  // two fixed layers at the bottom edge would stack. `count` already folds
  // in `hydrated`, so the bar never flashes in before the cart is read from
  // localStorage.
  //
  // What it no longer gates on: `checkoutHost !== "column"` and the order
  // block's IntersectionObserver. Both said «never two «Bestill» at once»,
  // and both watched the in-flow copy that task 6 deleted. The column gate
  // actively hurt afterwards — the flag is one per CART, so a checkout
  // opened in the column at 1280 and then narrowed to a phone left the
  // customer with no column AND no bar. The drawer, which is where the bar
  // sends everyone now, covers the bar while it is open, so the rule still
  // holds by geometry.
  const showStickyBar = count > 0 && !sheetOpen && !paletteSheetOpen;
  const stickyBar = showStickyBar && (
    <div
      data-testid="step3-sticky-bar"
      // z-40: under Radix's overlay/content (z-50), so the sheet and the
      // lightbox always win. bg + border from tokens (ADR 0008), and the
      // bottom padding clears the home indicator on iOS.
      className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-card px-4 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] lg:hidden"
    >
      {/* The whole left side is the button: a 44px-tall target that opens the
          drawer, not a decorative summary beside one. `min-w-0` twice so the
          truncation below actually has a box to truncate in. */}
      <button
        type="button"
        data-testid="sticky-bar-basket"
        onClick={openCart}
        aria-haspopup="dialog"
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ShoppingBag className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
        {/* ONE line, clipped as one (measured at 375 EN: the three parts want
            195px and the CTA leaves 120 — as three `shrink-0` flex children
            they ran under the pill). A plain block with `truncate` keeps the
            ellipsis and, more importantly, the bleed inside the button.
            What the tail loses at the narrowest widths is the unpainted
            count, which is the one thing here that is NOT lost: the pill
            beside it spells it out in full — «Paint 1 piece first» — for
            exactly as long as there is an unpainted piece. */}
        <span className="block truncate text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {t("cartTitle")} · {tc("stickyBar.pieces", { count: pieces })}
          {hasUnpainted && (
            <span className="text-warn-on-light">
              {" · "}
              {tc("stickyBar.unpainted", { count: unpaintedInBasket })}
            </span>
          )}
        </span>
        <span
          data-testid="sticky-bar-total"
          className="block truncate text-base font-semibold tabular-nums"
        >
          {formatMoney(discount.grandTotal, locale)}
        </span>
        {/* R4-SCONTI: the total above is already the grand total (R5-GARANZIA:
            net + shipping), so without this line the bar quietly shows less
            than the rows add up to and the customer only finds out by opening
            the drawer — after deciding. A discount found after the decision is
            a refund, not an incentive.
            Rendered ONLY when there is something to declare, so with no
            discount the bar keeps exactly the height it has today. */}
        {barSaved.amountCents > 0 && (
          <span
            data-testid="sticky-bar-saved"
            className="block truncate text-[11px] font-medium tabular-nums"
            style={{ color: "color-mix(in oklab, var(--discount), black 34%)" }}
          >
            {tc("stickyBar.saved", { amount: formatMoney(barSaved, locale) })}
          </span>
        )}
        </span>
      </button>
      {/* Same pill as the cart panel's CTA (§3.16) and the same label key, so
          R-PAY reskins both from one place. It carries the arrow because it
          DOES advance the funnel — see the e2e note in r-extra-pill.
          Fix round 1: `hasUnpainted` reskins it exactly like the panel's own
          primary pill (tertiary, `unpainted.cta`, no arrow — this tap does
          NOT send the order).
          Task 7: both faces now open the DRAWER, because below `lg` that is
          the only basket there is. Painting happens on the rows, which are
          in there; the order form is a mode of the basket, which is in
          there too. */}
      <NextStepPill
        data-testid="sticky-bar-checkout"
        className="shrink-0"
        variant={hasUnpainted ? "tertiary" : "primary"}
        label={hasUnpainted ? t("unpainted.cta", { count: unpaintedInBasket }) : to("title")}
        arrow={!hasUnpainted}
        onClick={() => {
          // «Paint N first»: open the drawer and let ITS paint-first
          // behaviour take over (`Basket`'s own CTA + the rows' Paint
          // buttons). The old `focusFirstUnpainted()` hunted for a row in
          // the column, which does not render below `lg` any more.
          //
          // «Bestill»: same gesture, with checkout already showing —
          // `checkoutHost` names the basket that asked (cart-context.tsx),
          // and here that is the drawer. The old `flushSync` + scrollIntoView
          // + focus('order-name') dance is gone with the in-flow block it
          // aimed at: what it bought — the keyboard up inside the tap's own
          // user gesture — is not buyable through a modal that takes focus
          // to its own content when it mounts. One tap still lands ON the
          // form with nothing to hunt for; the field costs one more.
          if (!hasUnpainted) setCheckoutHost("drawer");
          openCart();
        }}
        icon={
          hasUnpainted ? (
            <PillIcon variant="tertiary">
              <Brush className="size-5 text-muted-foreground" />
            </PillIcon>
          ) : (
            <PillIcon>
              <Truck className="size-5 text-primary-foreground" />
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
        // The bar is `fixed`, so it sits ON the page: without this the last
        // rows of the catalog stay under it. Same breakpoint as the bar.
        showStickyBar && "pb-24 lg:pb-0",
        // R5-PALETTE-IN-ACTION T2: the card pins itself (`sticky top-4`,
        // scoped to the catalogue column) instead of the old global bar. A
        // focused control now lands under the pinned card (~110px tall) —
        // keep clear of it.
        "md:[&_*:focus-visible]:scroll-mt-24"
      )}
      style={{
        // R5-TUTORIAL: the step-3 sticky order bar's own height at 390 —
        // measured in-browser (same recipe as `--mk-strip-h` above), the tour
        // CoachBar parks above it instead of stacking a second fixed strip.
        "--mk-sticky-bar-h": "73px",
      } as React.CSSProperties}
    >
      {/* Fix wave PR3 finding 7: the mockup (`Phone3`) puts `MobStrip`
          directly under the header, above the "Step 3 of 3" kicker — this
          used to render inside the left column, below both the stepper and
          the `<h2>`. For a `sticky` element DOM order IS scroll order, so
          that wasn't cosmetic: it mirrors the desktop card right
          above (also ahead of the nav cluster), and doesn't fight anything
          here — the nav cluster and shared-set banner below are ordinary
          in-flow siblings, no sticky/z-index of their own to collide with. */}
      {paintingStrip}

      {/* F21 nav cluster. R5-POLISH-STEP23 (TL, 22/9): the Back pill is GONE
          and the cluster is the stepper alone, exactly like steps 1-2 — with
          Back inline the stepper started further right and the bar visibly
          jumped between step 2 and step 3. The way back is the stepper
          itself (`onStepSelect`), which is the control that works at every
          width. Wrapper recipe: `STEP_NAV_STICKY`, shared with steps 1-2.

          THE BAND MATH (measured at 1280, move both together):
            12px `pt-3` + 44px of stepper + 12px `pb-3` = 68px of pinned band
            → the heading block pins at `top-[67px]`, one pixel INTO the band
              rather than below it: a gap of even 1px reads as a hairline,
              because what scrolls behind is the white product cards.
            → the rail pins at `top-[131px]` = 67 + the 64.5px of kicker+h2.
            Measured at 1280; the bar lost 7px when the Back pill went. */}
      <div className={STEP_NAV_STICKY} data-testid="step-nav">
        <Stepper
          ariaLabel={tc("stepperLabel")}
          current={2}
          steps={stepperSteps}
          onStepSelect={(i) => goToStep((i + 1) as 1 | 2 | 3)}
          className="mb-0 mt-0 flex-1"
        />
      </div>

      {/* R5-KIT fix 8: strip under the stepper — title + thumb from the
          persisted shop-window context (custom image fills the round). */}
      {kitMode && (
        <div className="mb-4">
          <KitStrip
            thumb={
              kitCtx?.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- resolved catalog asset
                <img
                  src={kitCtx.image}
                  alt=""
                  className="size-[30px] shrink-0 rounded-full border border-border object-cover"
                />
              ) : (
                <DesignRound layers={designLayers} className="size-[30px]" />
              )
            }
            title={kitShownTitle}
            total={kitStripCounts(cart).total}
            painted={kitStripCounts(cart).painted}
          />
        </div>
      )}

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

      {/* R5-TUTORIAL — 390, passo 3 (normal or kit3): the strip parks above
          the sticky order bar when it's showing (DS §3.32 "mai due strisce
          impilate in fondo"); `--mk-sticky-bar-h` measured at 390, same
          recipe as `--mk-strip-h` above. While the drawer is open the kit3
          CoachBar rides the sheet instead (`cart-menu.tsx`) — this one never
          mounts on top of it (kit3 nearly always finds the drawer already
          open on arrival, `openOnKitArrival`, so this fixed one is mostly a
          fallback for the rare case it isn't). */}
      {tourTip && tip && !cartOpen && (
        <CoachBar
          n={tip.n}
          text={tourTip.text}
          last={tourTip.last}
          onNext={handleTourNext}
          onHighlight={handleTourHighlight}
          onOff={() => tour.turnOff()}
          style={showStickyBar ? { bottom: "var(--mk-sticky-bar-h)" } : undefined}
        />
      )}

      {/* F21: two-column grid from `lg`. Below it the catalog is the whole
          page and the basket is the header drawer (task 6) — no in-flow
          copy, which is also what closes AC 5 (the rail cannot overflow 768
          if the rail does not exist there). */}
      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-2">
        {/* LEFT: ceramic selector */}
        <div className="flex min-w-0 flex-col">
          {/* R5-PALETTE-IN-ACTION T2 (TL review 21/9, fix overlap): kicker +
              heading + palette card form ONE sticky block on desktop
              (`md:sticky`, opaque `bg-background`). Before, only the
              card was sticky (`top-4`): the catalog slid through the 16px gap
              above it and reappeared "on top", and the heading scrolled away.
              Now the plates slide UNDER one solid surface and the heading
              stays visible. On mobile the block is static in flow and the
              card stays hidden (mobile keeps its own `paintingStrip`).
              R5-POLISH-STEP23: `top-[67px]`, not `top-0` — the step bar pins
              above it (68px band, arithmetic at the cluster) and this block
              tucks 1px under it.
              `bg-background` came off on the TL's word and went straight back
              on (TL, 22/9: «attenzione step3 non sparisce sotto sticky ma si
              vede»): transparent, the plates scroll OVER the heading.

              `-mx-3/px-3`, was `-mx-1/px-1` — and THIS is the faint vertical
              edge the TL kept seeing on both sides of the block («è un
              discorso di bordi?»). It never was a colour: the band is the
              same `--background` token `body` is painted with. The product
              cards carry `--shadow-card` (`0 2px 10px`), which bleeds ~5px
              PAST the column on each side; the band only overhung 4px, so a
              1-2px ribbon of that shadow stayed visible beside the band for
              its whole height and read as a container edge. 12px of overhang
              swallows the bleed and still clears the 28px column gap.
              No `pb` any more (TL, 22/9): the padding made the opaque band
              overshoot the card by 12px, so the plates were cut by a bare
              rose rectangle instead of disappearing under the white card —
              it read as a container edge. The band now ends exactly at the
              card's bottom border; the 12px of resting air moved to the
              catalogue's own `md:mt-3` below, where it scrolls away like
              any other in-flow spacing. The card's rounded corners still
              sit ON this background, so nothing peeks through them. */}
          <div className="md:sticky md:top-[67px] md:z-20 md:-mx-3 md:bg-background md:px-3">
            <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              {tc("stepIndicator", { step: 3 })}
            </p>
            <h2 className="mb-4 mt-1 text-xl font-semibold">{t("title")}</h2>

            {/* R5-NEW-PALETTE (DS §3.31): the card IS the switch — the
                painting palette lives in the NowBlock above, the saved ones
                below it as compact chips, «Edit colours ›» opens step 2 with
                the on-screen colours. Desktop-only (`hidden md:block`); the
                stickiness lives on the block above, so the card itself is
                static here. */}
            <div className="relative hidden md:block">
              <PaletteCard
                now={{
                  layers: designLayers,
                  name: paintingLabel,
                  dedication: currentDedication,
                  textPosition: snapshot.textPosition,
                  designName,
                  hexes: paletteHexes(snapshot),
                }}
                chips={switchChips}
                saved={palettes.length}
                actions={editColoursButton}
              />
              {/* R5-TUTORIAL round 3 — step3's tip 1 ("you're painting with
                  this palette") AND kit3's tip 2 (same copy, remapped in
                  `useTourTip`) share this anchor — `n` follows `tip.n`, not a
                  fixed number: kit3 counts its own three tips 1-3,
                  independent of the page's step. */}
              {tourTip &&
                tip &&
                ((tip.sequence === "step3" && tip.n === 1) ||
                  (tip.sequence === "kit3" && tip.n === 2)) && (
                <Hotspot
                  n={tip.n}
                  text={tourTip.text}
                  last={tourTip.last}
                  onNext={handleTourNext}
                  onOff={() => tour.turnOff()}
                  direction="down"
                />
              )}
            </div>
          </div>

          {/* §3.18: one section per series, 22px apart; 2 cols / gap-2.5 under
              960px, 3 cols / gap-3 from 960px. */}
          {/* R5-POLISH-STEP23: `md:mt-3` is the 12px the sticky block above
              used to carry as `pb-3`. In flow it looks the same at rest, but
              it scrolls: the plates now reach the card's bottom border and
              vanish under IT, not under a bare strip of page colour. */}
          <div
            className={cn(
              "relative flex flex-col gap-[22px] md:mt-3",
              pulseGrid && "tour-pulse rounded-xl"
            )}
            data-testid="ceramics-grid"
            ref={ceramicsGridRef}
          >
            {/* R5-TUTORIAL round 3 — step3's tip 2 ("pick your ceramics")
                AND kit3's tip 3 (same copy, remapped): the grid is already
                the anchor `handleTourHighlight` pulses for the last tip of
                either sequence. */}
            {tourTip &&
              tip &&
              ((tip.sequence === "step3" && tip.n === 2) ||
                (tip.sequence === "kit3" && tip.n === 3)) && (
              <Hotspot
                n={tip.n}
                text={tourTip.text}
                last={tourTip.last}
                onNext={handleTourNext}
                onHighlight={handleTourHighlight}
                onOff={() => tour.turnOff()}
              />
            )}
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
        </div>

        {/* RIGHT (from `lg`): docked cart always visible.
            mockup v5 `.cols`: the rail's top edge sits level with the catalog
            column's first series heading. Here the left column carries the
            kicker + <h2> above the grid, so the rail is nudged down by their
            combined height (measured 64.5px at md and above — both are
            fixed-size text blocks, so one constant covers every breakpoint).
            Update this if that heading block changes.
            R5-PALETTE-IN-ACTION T2: the global bar is gone, so the second
            sticky has nothing to slide under — the card pins in the LEFT
            column (`top-4`), the rail in the RIGHT, and the two columns never
            overlap. Back to plain `top-4` with the original 1rem breathing
            room.
            R5-POLISH-STEP23 T2 (feedback 2+7): the rail pins level with the
            palette card, so the two top borders line up. The LEFT block pins
            at 74px (band math at the nav cluster) and its kicker+h2 measure
            64.5px, so the card's top edge lands at 138.5px: `top-[138px]`,
            half a pixel out and invisible. Measured at 1280 — move it with
            the other two. Surface = palette-card.tsx:71 verbatim (white
            canvas, primary/20 border). */}
        <div
          className="relative hidden min-w-0 rounded-lg border border-primary/20 bg-[var(--mk-canvas)] p-4 lg:mt-16 lg:block lg:sticky lg:top-[131px] lg:self-start"
          data-testid="docked-cart-panel"
        >
          {/* R5-TUTORIAL — kit3's tip 1 ("paint what you have"). Plan
              ponytail: the ideal anchor is the rail's FIRST unpainted row
              (`cart-line-row.tsx`'s `data-unpainted`), but threading a slot
              prop through `Basket` → the one first-unpainted `CartLineRow`
              is a much bigger diff for the same sentence — the rail's own
              container says it just as well, badge in the corner. */}
          {tourTip && tip && tip.sequence === "kit3" && tip.n === 1 && (
            <Hotspot
              n={1}
              text={tourTip.text}
              last={tourTip.last}
              onNext={handleTourNext}
              onOff={() => tour.turnOff()}
            />
          )}
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
