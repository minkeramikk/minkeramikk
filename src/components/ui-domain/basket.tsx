"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Truck, Brush } from "lucide-react";
import { useCartContext, type CurrentConfig } from "@/lib/cart/cart-context";
import {
  basketCta,
  paintTargetFor,
  type BasketHost,
} from "@/components/ui-domain/basket-host";
import {
  clampPaintN,
  itemCount,
  pruneToLive,
  unpaintedPieces,
  type CartLine,
} from "@/lib/cart/cart";
import { formatMoney } from "@/lib/money/money";
import { cartSaved } from "@/lib/discounts/discount";
import { useShippingTotalSuffix } from "@/components/ui-domain/cart-shipping-row";
import { paletteFor } from "@/lib/palettes/palettes";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { CartLineRow } from "@/components/ui-domain/cart-line-row";
import { CartSuggestion } from "@/components/ui-domain/cart-suggestion";
import { CartTotals } from "@/components/ui-domain/cart-totals";
import { OrderForm } from "@/components/ui-domain/order-form";
import { UnpaintDialog } from "@/components/ui-domain/unpaint-dialog";
import { LineLightbox, lineLightboxSlides } from "@/components/ui-domain/line-lightbox";
import { NextStepPill, PillIcon } from "@/components/ui-domain/next-step-pill";

/**
 * Task 13 — the docked order pill's "go paint it" action, and the mobile
 * bar's own paint-first pill in the next PR (R5-UNPAINTED PR 3): same target,
 * same behaviour, so it is written ONCE here rather than twice. Pure DOM
 * query, no React state: `CartLineRow` already stamps `data-unpainted` on the
 * first unpainted row and a `data-testid="paint-line"` on its Paint button
 * (mockup's CTA scrolls to the row then "focuses the chip" — the chip is a
 * static `<span>` in this card, so the Paint button is the actionable focus
 * target instead, per the card's own note).
 *
 * NOT a bare `document.querySelector` (the card's own snippet, and the
 * mockup's single-page demo, both get away with one): the panel is rendered
 * TWICE, mobile section + desktop rail (`md:hidden`/`hidden md:block`), so
 * BOTH copies of every row are always in the DOM and an unscoped query can
 * resolve to the `display:none` half. `offsetParent !== null` is the cheap
 * "not display:none" check; it skips straight to whichever copy is actually
 * on screen at the current breakpoint.
 *
 * Task 4 — and once the header drawer mounts a THIRD copy of the same rows
 * (task 5), "visible" stops being enough: the drawer sits over step 3 with
 * both on screen at once. So the query takes a root, which is the basket's
 * own element. Returns whether it found a row, so a caller holding several
 * roots can try the next one.
 *
 * Fix round 1 — `root` is REQUIRED, deliberately: with `= document` as a
 * default this function was assignable to a `() => void` callback prop
 * (`UnpaintDialog`'s `onConfirmed`), which silently called it unscoped and
 * put the scoping back exactly where the task removed it. A required
 * parameter makes that substitution a type error. A caller that really wants
 * the whole page passes `document` and says so.
 */
export function focusFirstUnpaintedRow(root: ParentNode): boolean {
  const rows = root.querySelectorAll<HTMLElement>(
    '[data-testid="cart-line"][data-unpainted]'
  );
  const row = Array.from(rows).find((r) => r.offsetParent !== null);
  if (!row) return false;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.querySelector<HTMLElement>('[data-testid="paint-line"]')?.focus({ preventScroll: true });
  return true;
}

export {
  basketCta,
  paintTargetFor,
  type BasketHost,
} from "@/components/ui-domain/basket-host";

/**
 * R5-BASKET-HOST task 5 — the foot of the DRAWER's details panel: the MK
 * code, its copy button and «Edit design». Task 18 ruled these belong to the
 * drawer and not to step 3's drilldown, and until this task they rode on
 * `CartLineRecap`, which the drawer rendered instead of `CartLineRow`. Four
 * specs read them off the drawer (`cart.spec` "AC R2-D", `config-code.spec`,
 * `share-set.spec` AC5, `r4-canvas-white-evidence.spec`), so they travel with
 * the host, not with the component that stopped being rendered. Copy logic
 * lifted verbatim from `CartLineRecap` — same `actions.*` keys, same silent
 * catch when the clipboard is blocked.
 *
 * `onNavigate` is the drawer's own closer (the same `onAddCeramics` the empty
 * state's link already uses): the link navigates, so the sheet has to get out
 * of the way — `SheetClose` isn't reachable from here and doesn't need to be.
 */
function LineCodeSlot({
  line,
  onNavigate,
}: {
  line: CartLine;
  onNavigate?: () => void;
}) {
  const t = useTranslations("cart");
  const ta = useTranslations("actions");
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!line.configCode) return;
    try {
      await navigator.clipboard.writeText(line.configCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  }
  if (!line.configCode) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
          {line.configCode}
        </code>
        <button
          type="button"
          data-testid="cart-copy-code"
          onClick={copy}
          className="flex min-h-11 shrink-0 -my-2 items-center py-2 text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground md:my-0 md:min-h-0 md:py-0"
        >
          {copied ? ta("copied") : ta("copyCode")}
        </button>
      </div>
      <Link
        href={`/configurator?code=${encodeURIComponent(line.configCode)}&step=2`}
        data-testid="cart-edit-design"
        onClick={onNavigate}
        className="flex min-h-11 shrink-0 -my-2 items-center py-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground md:my-0 md:min-h-0 md:py-0"
      >
        ✎ {t("line.edit")}
      </Link>
    </div>
  );
}

/**
 * The handle `ceramics-step.tsx` keeps on each basket it mounted — only for
 * what is genuinely per-instance. Opening the checkout form is NOT: that is a
 * mode of the basket and lives in `cart-context.tsx`, so the step just calls
 * `setCheckoutHost("column")` itself.
 */
export type BasketHandle = {
  /** `focusFirstUnpaintedRow` scoped to THIS basket; false when it has no
   *  visible unpainted row, so the caller can try its other copy. */
  focusFirstUnpainted: () => boolean;
};

/**
 * R5-BASKET-HOST task 4 — «there are not two baskets». The step-3 right
 * column and the header's side drawer render THIS component; `host` is the
 * only thing that differs between them.
 *
 * Moved here from `ceramics-step.tsx`'s own `cartPanel` block, together with
 * the state that block owns (`expandedId`, `paintN`, `rowPaletteCode`,
 * `pickerOpenId`, `unpaintId`, `checkoutHost`, `openPhotoId`), the ONE effect
 * that prunes all of them against live line ids, and the two dialogs those
 * pointers drive. The step keeps everything else: the catalog, the sheets,
 * the palette bar, the sticky bar, the share.
 *
 * What the host actually changes, and nothing more:
 *
 * - the COLUMN is sticky and shows whole, so it has no fixed foot: the
 *   detail block (`CartSuggestion` + `CartTotals`) is followed by the CTA and
 *   then `footerSlot`, exactly where they have always been;
 * - the DRAWER scrolls, so it keeps ONE fixed line at the bottom at every
 *   width (net total, what the basket saves, the CTA) and «+ Add ceramics»
 *   at the end of the scroll, after the detail block. Reading order both
 *   ways: rows → numbers → order. No accordion anywhere.
 * - the testids, which twelve Playwright specs depend on: see `basketCta`
 *   and the `drawer` ternaries below.
 */
export function Basket({
  host,
  currentConfig,
  onAddCeramics,
  onPaintFirst,
  footerSlot,
  ref,
}: {
  host: BasketHost;
  /**
   * What is painting right now, published by whichever step is on screen
   * (`cart-context.tsx`). `null` means there is NO configuration on screen —
   * the drawer opened at step 1: the «painted with» line stays away, rows get
   * `paintTarget: { kind: "none" }` and no picker can open.
   */
  currentConfig: CurrentConfig | null;
  /** Drawer only: «+ Add ceramics» at the end of the scroll — it closes the
   *  drawer and sends the customer back to the catalog. */
  onAddCeramics?: () => void;
  /** What «Paint N pieces first ›» does in this host. Default (the column):
   *  focus the first unpainted row of THIS basket. The drawer closes itself,
   *  goes to step 3 and focuses it there. */
  onPaintFirst?: () => void;
  /** Column only: the new-design + share pills and the share feedback — they
   *  belong to the step (they navigate it, and the share state lives there). */
  footerSlot?: React.ReactNode;
  ref?: React.Ref<BasketHandle>;
}) {
  const drawer = host === "drawer";
  const t = useTranslations("cart");
  const to = useTranslations("order");
  const locale = useLocale() as "no" | "en";
  const {
    cart,
    hydrated,
    setQuantity,
    remove,
    clear,
    paint,
    unpaint,
    discount,
    palettes,
    touch: touchPalette,
    // Fix round 1 — state of THE basket, not of this container: the checkout
    // mode and the two line-keyed pending decisions. See `cart-context.tsx`.
    checkoutHost,
    setCheckoutHost,
    rowPaletteCode,
    setRowPalette,
    setPaintN,
    paintNFor,
  } = useCartContext();
  /** R5-PALETTES task 9 — which saved palette (if any) IS the config on
   *  screen. Same read `ceramics-step.tsx` does: the URL is the truth. */
  const activePalette = currentConfig ? paletteFor(palettes, currentConfig.code) : null;
  /** The basket's own element: the root `focusFirstUnpaintedRow` is scoped to. */
  const rootRef = useRef<HTMLDivElement>(null);
  const focusFirstUnpainted = useCallback(
    () => focusFirstUnpaintedRow(rootRef.current ?? document),
    []
  );
  /** `() => void` for the callback props that want it — the boolean is for
   *  the handle's caller, which uses it to try its other copy. */
  const focusFirstUnpaintedVoid = useCallback(() => {
    focusFirstUnpainted();
  }, [focusFirstUnpainted]);

  /** CA-3 E: id of the one expanded cart row (one at a time), or null. */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** R5-UNPAINTED task 11: id of the line the `UnpaintDialog` is open for, or
   *  null. The dialog itself keeps rendering its last line through the exit
   *  animation (see its own comment) — this id only drives whether it's open. */
  const [unpaintId, setUnpaintId] = useState<string | null>(null);
  const unpaintLine = cart.find((l) => l.id === unpaintId) ?? null;
  /** R5-BASKET-HOST task 3: id of the line the thumb's `LineLightbox` is open
   *  for, or null. Same recurring-id trap as `unpaintId` — pruned in the same
   *  effect below, and `openPhotoLine` resolving to `null` when the id no
   *  longer matches a live line is what closes the dialog instead of letting
   *  it render empty. */
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);
  const openPhotoLine = cart.find((l) => l.id === openPhotoId) ?? null;
  /** Which row's picker panel is open — mirrors the mockup's `S3.pick[id]`
   *  (a map, so more than one COULD be open; in practice only the row the
   *  customer is touching ever is). Same prune as the map above. */
  const [pickerOpenId, setPickerOpenId] = useState<Record<string, boolean>>({});
  /**
   * The palette a given unpainted row will Paint with right now: the
   * customer's own pick from that row's picker, else whatever's on screen —
   * the exact `configCode`/`snapshot`/`designLayers` `paint()` already used
   * before this task, so an untouched row's behaviour doesn't change.
   * `code` doubles as which picker pill gets the ring (`currentThumb.code`
   * in `CartLineRow`), so this is the ONE place that resolves it.
   *
   * Fix wave A finding 2: an untouched row (no entry in `rowPaletteCode`)
   * used to resolve `configCode` through `paletteFor` too, which — right
   * after "Save as palette", when the on-screen config IS a saved palette —
   * swapped in that palette's own STORED snapshot instead of the props one.
   * That stored snapshot has no `customNote`/`customText` (a palette is
   * colours only, F38/R2-2b never travel in the code), so painting an
   * untouched row silently dropped the customer's words while "Legg i
   * handlekurv" a few hundred lines below kept them — same design, same
   * colours, two different inscriptions in the same basket. `activePalette`
   * is now only ever borrowed for its code/name (display), never its
   * snapshot/layers, on the untouched path.
   *
   * An EXPLICIT pick (TL ruling) takes the palette's COLOURS but keeps the
   * customer's own words: `customNote`/`customText` are carried from the
   * current on-screen `snapshot` into the palette snapshot this row paints
   * with — the palette is a set of colours, not a replacement for what the
   * customer wrote.
   */
  const rowThumb = useCallback(
    (line: { id: string }) => {
      const explicitCode = rowPaletteCode[line.id];
      const explicitPalette = explicitCode ? paletteFor(palettes, explicitCode) : null;
      if (explicitPalette) {
        return {
          code: explicitPalette.code,
          layers: explicitPalette.layers,
          label: explicitPalette.name,
          hexes: explicitPalette.snapshot.selections
            .map((s) => s.hex)
            .filter((h): h is string => Boolean(h)),
          snapshot: {
            ...explicitPalette.snapshot,
            customNote: currentConfig?.snapshot.customNote,
            customText: currentConfig?.snapshot.customText,
          },
        };
      }
      return {
        code: activePalette?.code ?? currentConfig?.code ?? "",
        layers: currentConfig?.layers ?? [],
        // TL follow-up (post-task-12): same `paintingLabel` the bar's chip
        // and the basket header now share — this fell back straight to
        // `designName` before, the same "vaguer of two names for the same
        // thing on screen" bug the header had.
        label: currentConfig?.label ?? "",
        hexes:
          currentConfig?.snapshot.selections
            .map((s) => s.hex)
            .filter((h): h is string => Boolean(h)) ?? [],
        snapshot: currentConfig?.snapshot ?? null,
      };
    },
    [rowPaletteCode, palettes, activePalette, currentConfig]
  );
  /**
   * Bug fix (task 11 review): a cart line id RECURS — `cart.ts` gives every
   * unpainted lot of a product (and every painted lot of one config) the SAME
   * id, because there is only ever one such line at a time. `paintNFor` above
   * clamps a stored number DOWN when its line shrinks, but nothing dropped
   * the entry — or `unpaintId` itself — when a line disappeared entirely
   * (paint in full, «Remove all», a cross-tab sync). Left alone, a number (or
   * an OPEN dialog) meant for one lot survives to land on the NEXT lot of the
   * same product, which should start untouched. Root cause lives here, in the
   * one place that owns both `paintN` and `unpaintId`, not in each caller that
   * can make a line disappear: whenever the cart no longer has a line for some
   * id, that id's entry — and a dialog pinned to it — is stale by definition.
   *
   * Fix round 2 (finding 2): `expandedId` (declared above) is a THIRD state
   * keyed the same recurring way — pruned here too, so a removed-then-
   * recreated line never mounts already expanded.
   *
   * Task 10: `pickerOpenId` joins the same one effect — `pruneToLive`
   * (`lib/cart/cart.ts`) is the shared pruning logic every one of these
   * maps/pointers needs, computed against the SAME `liveIds` set rather than
   * each map recomputing its own.
   *
   * Task 3 (R5-BASKET-HOST): `openPhotoId` joins the same effect.
   *
   * Fix round 1: `paintN` and `rowPaletteCode` have LEFT this effect with the
   * state itself — they are a pending decision about a line, shared by every
   * basket on screen, so `cart-context.tsx` owns them and prunes them there,
   * with the same `pruneToLive`. What is left here is the view-only half:
   * four pointers that are rightly per-basket (a row expanded in the drawer
   * must not expand in the column). No map is pruned in two places.
   */
  useEffect(() => {
    const liveIds = new Set(cart.map((l) => l.id));
    setPickerOpenId((m) => pruneToLive(m, liveIds));
    setUnpaintId((id) => (id && !liveIds.has(id) ? null : id));
    setExpandedId((id) => (id && !liveIds.has(id) ? null : id));
    setOpenPhotoId((id) => (id && !liveIds.has(id) ? null : id));
  }, [cart]);

  const count = hydrated ? itemCount(cart) : 0;
  /** R5-UNPAINTED task 9: the basket's own explanation box, mirroring the
   *  header marker (cart-menu.tsx) — pieces, not lines. */
  const unpaintedInBasket = hydrated ? unpaintedPieces(cart) : 0;
  /** Task 13: the order CTA and the checkout form both gate on this. */
  const hasUnpainted = unpaintedInBasket > 0;
  /* Fix round 2 (finding 3) said this must not be a render gate alone: the
     flag has to be FLIPPED back, or the sticky bar hides itself with nothing
     to show for it and the form pops open unprompted when the last piece is
     painted. That effect moved to `cart-context.tsx` with the flag itself
     (fix round 1) — one rule for every surface, and not two effects racing
     over one state. `formOpen` below stays a render gate, which is also what
     covers the frame before the cart has hydrated. */
  useImperativeHandle(ref, () => ({ focusFirstUnpainted }), [focusFirstUnpainted]);
  /** The foot's own two numbers (drawer only) — taken from the engine, never
   *  re-added here, so the foot can never disagree with `CartTotals` above. */
  const saved = cartSaved(discount);
  const totalSuffix = useShippingTotalSuffix(discount.total);

  // ── The panel itself, in pieces the two hosts assemble differently ──
  const header = (
    <>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        {/* The drawer is a Sheet and its `SheetTitle` already names it (and
            has to, for a11y) — a second «Handlekurv» under it would read as
            a second basket, which is the one thing this card is about. */}
        {!drawer && <h2 className="text-base font-semibold">{t("cartTitle")}</h2>}
        {/* Fix wave B finding 3 — mockup `#s3a`'s header line, the
            replacement for the removed "Ditt valg" box (task 9): says what a
            NEW ceramic added right now gets painted with. TL follow-up
            (post-task-12): this used to fall back straight to `designName`
            for an unsaved draft, while the bar's OWN chip (a few hundred
            lines up) named the exact same configuration with its
            deterministic colour label — two names for one thing on one
            screen, and the vaguer one is the one this header showed. Both
            now read `paintingLabel`, computed ONCE above, so they can't
            drift apart again; `designName` only survives inside that
            variable's own fallback chain, for when there's no configuration
            to name at all. Hidden with the box's own rule (AC4) when
            there's no config at all yet (a bare `?set=` landing).
            TODO:nb-review — cart.paintedWith NO copy is new, unreviewed. */}
        {currentConfig?.explicit && (
          <span className="text-xs text-muted-foreground">
            {t.rich("paintedWith", {
              name: currentConfig.label,
              b: (chunks) => <b className="font-semibold text-foreground">{chunks}</b>,
            })}
          </span>
        )}
      </div>

      {/* R5-UNPAINTED task 9: explicit, no button inside — Paint lives on the
          row itself (task 10). Pieces, not lines, like the header marker.
          Task 10: copy reworded "choose a palette" (was "choose the
          colours") now that the row actually has a picker to open.
          TODO:nb-review — cart.unpainted.note NO copy is new, unreviewed. */}
      {unpaintedInBasket > 0 && (
        <p
          data-testid="basket-unpainted-note"
          className="mb-1 rounded-sm bg-muted px-3 py-2 text-xs text-foreground/80"
        >
          <span className="text-warn">○</span>{" "}
          {t("unpainted.note", { count: unpaintedInBasket })}
        </p>
      )}
    </>
  );

  const list = (
    <div data-testid="cart-list" className="flex flex-col">
            {/* R5-UNPAINTED task 8: unpainted lines float to the top, exactly
                as the mockup sorts them (renderS3: (a.code?1:0)-(b.code?1:0)). */}
            {[...cart]
              .sort((a, b) => Number(a.configCode !== null) - Number(b.configCode !== null))
              .map((line) => {
                // Task 10: resolved ONCE per row — `currentThumb` (what the
                // chip/picker shows) and `onPaint` (what Paint applies) must
                // agree on the exact same palette, or the button could paint
                // something other than what the row just showed.
                const thumb = rowThumb(line);
                return (
                  <CartLineRow
                    key={line.id}
                    line={line}
                    locale={locale}
                    d={discount.perLine[line.id]}
                    open={expandedId === line.id}
                    onToggleDetails={() =>
                      setExpandedId((id) => (id === line.id ? null : line.id))
                    }
                    onQty={(q) => setQuantity(line.id, q)}
                    onRemove={() => remove(line.id)}
                    // Task 10: paint n pieces with the ROW's own chosen
                    // palette (`thumb`, above) — NOT the URL/active config,
                    // so this never navigates and `activeCode` never moves
                    // (AC 2). Task 11: open the dialog, keyed by line id — it
                    // reads the live line itself, so it always shows current
                    // quantity even if the cart changes while it's open.
                    onPaint={(n) => paint(line.id, n, thumb.code, thumb.snapshot, thumb.layers)}
                    onUnpaint={() => setUnpaintId(line.id)}
                    n={paintNFor(line)}
                    onN={(next) => setPaintN(line.id, clampPaintN(next, line.quantity))}
                    currentThumb={thumb}
                    palettes={palettes}
                    currentDesignSlug={currentConfig?.designSlug ?? ""}
                    pickerOpen={!!pickerOpenId[line.id]}
                    onTogglePicker={() =>
                      setPickerOpenId((m) => ({ ...m, [line.id]: !m[line.id] }))
                    }
                    onPickPalette={(code) => {
                      setRowPalette(line.id, code);
                      // Mockup `selPal`: choosing one closes the picker.
                      setPickerOpenId((m) => ({ ...m, [line.id]: false }));
                      // Fix wave A finding 5: ADR 0028 is LEAST-RECENTLY-
                      // USED — a palette picked here IS a use, same as
                      // `paintWith` touching it. Without this a palette
                      // used on rows all afternoon keeps its old `usedAt`
                      // and is first out of the LRU.
                      touchPalette(code, Date.now());
                    }}
                    // R5-BASKET-HOST task 4: `{ kind: "palette" }` whenever
                    // there IS a configuration on screen (step 3 always has
                    // one, so its behaviour is unchanged); the drawer opened
                    // at step 1 has none, and the chip becomes the link to
                    // step 2 instead — one pure decision, `paintTargetFor`.
                    paintTarget={paintTargetFor(
                      currentConfig,
                      line.configSnapshot?.designSlug
                    )}
                    // R5-BASKET-HOST task 3: the thumb now opens something —
                    // keyed by id, pruned in the shared effect above. Fix
                    // round 1 — only when there's actually something to show:
                    // a pre-F19 line can carry neither `plateImage` nor
                    // `layers` (both optional, no migration), and without
                    // this gate that line's thumb would still turn into a
                    // real button opening a title + ✕ over a blank area.
                    onOpenPhoto={
                      lineLightboxSlides(line).length > 0
                        ? () => setOpenPhotoId(line.id)
                        : undefined
                    }
                    // Drawer only — see `LineCodeSlot` above. The column's
                    // details panel keeps exactly the shape task 2 gave it.
                    detailSlot={
                      drawer ? <LineCodeSlot line={line} onNavigate={onAddCeramics} /> : undefined
                    }
                  />
                );
              })}
    </div>
  );

  /**
   * Task 13 (mockup: bottom of `renderS3`) — while anything is unpainted, the
   * pill that would open checkout is REPLACED, not merely disabled: it
   * becomes a tertiary "go paint it" CTA. No `arrow`: unlike «Bestill» this
   * click doesn't advance the funnel, matching the other non-advancing pills
   * in the column's stack (`new-design-cta`, `share-set`).
   *
   * Task 4 — one decision, rendered twice. `basketCta` (pure, tested) owns
   * both the face and the testid; the host only chooses the pill's size and
   * where it sits. Default `onPaintFirst` is this basket's own scoped focus,
   * which is what the column has always done; the drawer passes its own
   * (close, go to step 3, focus it there).
   * TODO:nb-review — cart.unpainted.cta NO copy is new, unreviewed.
   */
  const cta = basketCta(host, unpaintedInBasket);
  const ctaPill = (size: "lg" | "sm", className: string) =>
    cta.face === "paint" ? (
      <NextStepPill
        variant="tertiary"
        size={size}
        data-testid={cta.testId}
        className={className}
        label={t("unpainted.cta", { count: unpaintedInBasket })}
        icon={
          <PillIcon variant="tertiary">
            <Brush className="size-5 text-muted-foreground" />
          </PillIcon>
        }
        onClick={onPaintFirst ?? focusFirstUnpainted}
      />
    ) : (
      /* Camioncino, non freccia: l'ordine parte, non c'è uno step successivo
         nel wizard (nota-step3-cart.md). */
      <NextStepPill
        size={size}
        data-testid={cta.testId}
        className={className}
        caption={t("checkoutKicker")}
        label={to("title")}
        arrow
        icon={
          <PillIcon>
            <Truck className="size-5 text-primary" />
          </PillIcon>
        }
        onClick={() => setCheckoutHost(host)}
      />
    );

  /**
   * `checkoutHost === host`: the checkout is ONE decision for the whole
   * basket, taken in the host that asked for it. The drawer's CTA draws the
   * form in the drawer, the column's in the column - never in all three
   * mounted baskets at once (see `cart-context.tsx`).
   *
   * Task 13: `!hasUnpainted` gates the form shut even if it was already open
   * when the basket picked up a new unpainted line (e.g. adding a ceramic
   * mid-checkout) — the order can never leave with colourless pieces, so the
   * form can never be on screen with one either.
   */
  const formOpen = !hasUnpainted && checkoutHost === host;
  const checkoutForm = (
    // scroll-mt: the mobile header is sticky and 56px tall, so a bare
    // scrollIntoView would park the form's first rows under it. Fix wave PR3
    // finding 2: `md:scroll-mt-[4.5rem]` is that desktop-header-only value,
    // unchanged — but below `md` the header stacks with `paintingStrip`'s own
    // `sticky top-14` (task 13), ~111-117px combined, not 72px.
    <div
      data-testid={drawer ? "cart-checkout-form" : "docked-checkout-form"}
      className="scroll-mt-[7.5rem] md:scroll-mt-[4.5rem]"
    >
      <button
        type="button"
        data-testid={drawer ? "cart-back" : "docked-back-to-cart"}
        onClick={() => setCheckoutHost(null)}
        className="mb-3 self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        ← {t("backToCart")}
      </button>
      <OrderForm
        cart={cart}
        onSuccess={() => {
          clear();
          setCheckoutHost(null);
        }}
      />
    </div>
  );

  /**
   * Card §3-bis (a), as amended by the TL on 19/9 — the reading order is
   * rows → numbers → order. `CartSuggestion` + `CartTotals` are the DETAIL
   * BLOCK and they sit at the END of the scroll, in flow, after the rows. No
   * accordion. In the drawer «+ Add ceramics» follows them, and below that
   * nothing: the foot is one fixed line and the numbers that explain the
   * total live up here.
   *
   * The column keeps its shape: it is sticky and shows whole, so it has no
   * fixed foot at all and its CTA stack stays where it has always been,
   * after the totals.
   */
  const cartPanel = drawer ? (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pt-3">{header}</div>
      {count === 0 ? (
        // Fix round 1: «empty» is not a dead end. The drawer is the one host
        // with no catalog behind it, so it keeps the way out `cart-menu.tsx`
        // has always shown here; `onAddCeramics` (the drawer's own closer)
        // rides along so the sheet gets out of the way as the link navigates.
        <div
          data-testid="cart-empty"
          className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
        >
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
          {/* `min-h-11`: the drawer is full-width on a phone, and the DS
              button's own height (32px) is under the 44px touch minimum. */}
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/configurator" data-testid="cart-empty-cta" onClick={onAddCeramics}>
              {t("emptyCta")}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4">
            {formOpen ? (
              checkoutForm
            ) : (
              <>
                {list}
                <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
                  <CartSuggestion />
                  <CartTotals />
                </div>
                {/* TODO:nb-review — cart.addCeramics NO copy is new. */}
                {onAddCeramics && (
                  <button
                    type="button"
                    data-testid="cart-add-ceramics"
                    onClick={onAddCeramics}
                    className="mb-4 mt-3 flex h-11 w-full items-center justify-center rounded-sm border border-dashed border-primary/50 text-sm font-medium text-primary hover:bg-muted"
                  >
                    {t("addCeramics")}
                  </button>
                )}
              </>
            )}
          </div>
          {/* The foot, EVERY width (card precisazione 19/9): one line, so
              «Bestill» can never fall below the fold in a long basket. Net
              total large, what the basket saves under it, the CTA to its
              right. Nothing else — `+ frakt` rides on the total itself
              because it IS the total's own qualifier (same `suffix` the
              sticky bar and `CartTotals` print), not a second number.
              TODO:nb-review — cart.saved NO copy is new, unreviewed. */}
          {!formOpen && (
            <div className="flex shrink-0 items-center gap-3 border-t border-border bg-card px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-semibold tabular-nums">
                  {formatMoney(discount.total, locale)}
                  {totalSuffix}
                </span>
                {saved.amountCents > 0 && (
                  <span className="mt-0.5 block text-[12px] font-medium tabular-nums text-status-paid">
                    {t("saved", { amount: formatMoney(saved, locale) })}
                  </span>
                )}
              </span>
              {ctaPill("sm", "max-w-[58%] shrink-0")}
            </div>
          )}
        </>
      )}
    </div>
  ) : (
    <div className="flex flex-col gap-0" data-testid="docked-cart" ref={rootRef}>
      {header}
      {count === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          {list}

          <CartSuggestion />

          {/* R4-BTN-SCALE AC1: `gap-3` ripristinato. Era stato tolto da
              R4-SCONTI con la motivazione «CartTotals now owns a single child
              here»: falsa nei fatti — dopo `CartTotals` questo flex ha altri
              quattro figli (le tre pillole dello stack e il live-region dello
              share), quindi toglierlo ha incollato i tre bordi tra loro e ha
              fatto leggere lo stack come un blocco unico. Il gap interno di
              `CartTotals` regge le SUE righe, non il ritmo di questo stack. */}
          <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
            <CartTotals totalTestId="docked-total" />

            {formOpen ? (
              checkoutForm
            ) : (
              <>
                {/* R-EXTRA: lo stack usa la stessa pillola degli step 1/2
                    (DESIGN-SYSTEM §3.16). Solo "Send bestilling" ha la
                    freccetta e il riempimento: gli altri due non fanno
                    avanzare il funnel (uno riavvia il flusso, l'altro è
                    collaterale). R3-C (final): "Bygg et nytt design" resta
                    l'UNICO punto da cui si ricomincia, e tiene il carrello
                    (F03/F16). */}
                {ctaPill("lg", "w-full")}
                {footerSlot}
              </>
            )}
          </div>
        </>
      )}

    </div>
  );

  return (
    <>
      {cartPanel}
      {/* R5-UNPAINTED task 11: the inverse of Paint. One per `Basket` — two
          on step 3 today (mobile section + desktop rail), three once the
          header drawer mounts its own — driven by that basket's own
          `unpaintId`, which is why only the copy the customer actually
          touched ever opens one. `unpaint()` is the pure primitive's context
          wrapper (use-cart.ts); this component only decides WHEN and WITH
          WHAT n. Radix portals it to <body>, so it adds nothing to the
          panel's own DOM while closed. */}
      <UnpaintDialog
        line={unpaintLine}
        locale={locale}
        onOpenChange={(open) => !open && setUnpaintId(null)}
        onConfirm={(n) => {
          if (unpaintLine) unpaint(unpaintLine.id, n);
          setUnpaintId(null);
        }}
        // Fix round 2 (finding 4): confirming removes the row that opened
        // this dialog (the painted line becomes/joins the unpainted one), so
        // the dialog's own default focus-return (the row's «Unpaint…»
        // button) is a silent no-op. Hand focus to the survivor instead.
        onConfirmed={focusFirstUnpaintedVoid}
      />

      {/* R5-BASKET-HOST task 3: the row thumb's photo viewer. One per
          `Basket`, same as the dialog above and for the same reason, driven
          by that basket's own `openPhotoId` (a `CartLine | null` + a ref that
          keeps rendering the last one through Radix's exit animation). No
          manual focus handling: the thumb button that opened it stays
          mounted, so Radix's own default `onCloseAutoFocus` returns focus
          there. */}
      <LineLightbox
        line={openPhotoLine}
        locale={locale}
        onOpenChange={(open) => !open && setOpenPhotoId(null)}
      />
    </>
  );
}
