"use client";

import { useCallback, useEffect, useImperativeHandle, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Truck, Brush } from "lucide-react";
import { useCartContext } from "@/lib/cart/cart-context";
import {
  itemCount,
  unpaintedPieces,
  type CartLayer,
  type ConfigSnapshot,
} from "@/lib/cart/cart";
import { paletteFor } from "@/lib/palettes/palettes";
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
 * mockup's single-page demo, both get away with one): `cartPanel` above is
 * rendered TWICE, mobile section + desktop rail (`md:hidden`/`hidden
 * md:block`), so BOTH copies of every row are always in the DOM and an
 * unscoped query can resolve to the `display:none` half — exactly the
 * failure mode the sticky bar's own click handler already scopes around a
 * few hundred lines down. `offsetParent !== null` is the cheap "not
 * display:none" check; it skips straight to whichever copy is actually on
 * screen at the current breakpoint.
 */
export function focusFirstUnpaintedRow() {
  const rows = document.querySelectorAll<HTMLElement>(
    '[data-testid="cart-line"][data-unpainted]'
  );
  const row = Array.from(rows).find((r) => r.offsetParent !== null);
  row?.scrollIntoView({ behavior: "smooth", block: "center" });
  row?.querySelector<HTMLElement>('[data-testid="paint-line"]')?.focus({ preventScroll: true });
}

/**
 * R5-UNPAINTED/R5-PALETTES — every per-row map on this step (`paintN`, and
 * task 10's `rowPaletteCode`/`pickerOpenId`) is keyed by cart line id, and a
 * line id RECURS (`cart.ts`'s `${productId}::${code}`, and `::unpainted`):
 * paint a row in full and its id can be reborn as a brand-new, untouched
 * lot of the same product. Left alone, a stale entry would hand that new
 * lot someone else's leftover choice. One shared pruner, called from the
 * ONE effect below that owns every such map — not a second cleanup per map.
 */
function pruneToLive<T>(m: Record<string, T>, liveIds: Set<string>): Record<string, T> {
  let changed = false;
  const next: Record<string, T> = {};
  for (const [id, v] of Object.entries(m)) {
    if (liveIds.has(id)) next[id] = v;
    else changed = true;
  }
  return changed ? next : m;
}

/** Where this basket is mounted. Task 5 adds the header drawer; step 3's
 *  right column (and its mobile in-flow twin) is `"column"`. */
export type BasketHost = "column" | "drawer";

/**
 * The handle `ceramics-step.tsx` keeps on the basket it mounted. The step's
 * own sticky order bar (mobile) opens the checkout form that now lives in
 * here, and it must happen INSIDE the click's user gesture (`flushSync` at
 * the call site) or iOS keeps the keyboard shut.
 */
export type BasketHandle = {
  /** Expand the order form in place (the step-3 `docked-checkout-form`). */
  openCheckout: () => void;
};

/**
 * R5-BASKET-HOST task 4 — «there are not two baskets». The step-3 right
 * column and the header's side drawer render THIS component; `host` is the
 * only thing that differs between them.
 *
 * Moved here VERBATIM from `ceramics-step.tsx`'s own `cartPanel` block,
 * together with the state that block owns (`expandedId`, `paintN`,
 * `rowPaletteCode`, `pickerOpenId`, `unpaintId`, `checkoutOpen`,
 * `openPhotoId`), the ONE effect that prunes all of them against live line
 * ids, and the two dialogs those pointers drive. The step keeps everything
 * else: the catalog, the sheets, the palette bar, the sticky bar, the share.
 */
export function Basket({
  configCode,
  snapshot,
  designLayers,
  designSlug,
  hasConfig,
  paintingLabel,
  footerSlot,
  onCheckoutOpenChange,
  ref,
}: {
  host: BasketHost;
  /** What a ceramic added right now gets painted with — the step's own
   *  server props, unchanged (task 5 replaces these with `currentConfig`). */
  configCode: string;
  snapshot: ConfigSnapshot;
  designLayers: CartLayer[];
  designSlug: string;
  /** AC4: is there a configuration the customer actually CHOSE on screen? */
  hasConfig: boolean;
  paintingLabel: string;
  /** Column only: the new-design + share pills and the share feedback — they
   *  belong to the step (they navigate it, and the share state lives there). */
  footerSlot?: React.ReactNode;
  /** The step's sticky bar hides itself while the form is open, so it has to
   *  hear about a state this component now owns. */
  onCheckoutOpenChange?: (open: boolean) => void;
  ref?: React.Ref<BasketHandle>;
}) {
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
  } = useCartContext();
  /** R5-PALETTES task 9 — which saved palette (if any) IS the config on
   *  screen. Same read `ceramics-step.tsx` does: the URL is the truth. */
  const activePalette = paletteFor(palettes, configCode);

  /** Desktop + mobile inline: expands the order form in the cart panel. */
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  /** CA-3 E: id of the one expanded cart row (one at a time), or null. */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /**
   * R5-UNPAINTED task 10: "how many to paint" per unpainted line — the row
   * owns none of this (mirrors the mockup's `S3.n[id]`). Read through
   * `paintNFor` below, which clamps to the line's current quantity, so a
   * stale stored value (from before a partial paint shrank the line) never
   * renders or submits out of range — the row never has to know.
   */
  const [paintN, setPaintN] = useState<Record<string, number>>({});
  const paintNFor = useCallback(
    (line: { id: string; quantity: number }) =>
      Math.min(Math.max(1, paintN[line.id] ?? line.quantity), line.quantity),
    [paintN]
  );
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
  /**
   * R5-PALETTES task 10 — an unpainted row's OWN palette pick, distinct from
   * the active/on-screen one (card §4-bis: a row can paint with a DIFFERENT
   * palette). Untouched (no entry) → defaults to whatever's on screen, same
   * as every row painted before this task; `rowThumb` below resolves it.
   * Same recurring-id trap as `paintN`/`unpaintId`/`expandedId` — pruned by
   * the same effect, not a second one (see `pruneToLive`).
   */
  const [rowPaletteCode, setRowPaletteCode] = useState<Record<string, string>>({});
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
            customNote: snapshot.customNote,
            customText: snapshot.customText,
          },
        };
      }
      return {
        code: activePalette?.code ?? configCode,
        layers: designLayers,
        // TL follow-up (post-task-12): same `paintingLabel` the bar's chip
        // and the basket header now share — this fell back straight to
        // `designName` before, the same "vaguer of two names for the same
        // thing on screen" bug the header had.
        label: paintingLabel,
        hexes: snapshot.selections.map((s) => s.hex).filter((h): h is string => Boolean(h)),
        snapshot,
      };
    },
    [rowPaletteCode, palettes, activePalette, configCode, designLayers, paintingLabel, snapshot]
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
   * Task 10: `rowPaletteCode`/`pickerOpenId` join the same one effect —
   * `pruneToLive` (module scope, above) is the shared pruning logic every
   * one of these five maps/pointers needs, computed against the SAME
   * `liveIds` set rather than each map recomputing its own.
   *
   * Task 3 (R5-BASKET-HOST): `openPhotoId` joins the same effect — a sixth
   * pointer keyed the same recurring way.
   */
  useEffect(() => {
    const liveIds = new Set(cart.map((l) => l.id));
    setPaintN((m) => pruneToLive(m, liveIds));
    setRowPaletteCode((m) => pruneToLive(m, liveIds));
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
  /**
   * Fix round 2 (finding 3) — task 13's render gate (`!hasUnpainted &&
   * checkoutOpen` below) only stops the form from being SHOWN; it never
   * flips `checkoutOpen` back to false, and both `setCheckoutOpen(false)`
   * call sites live inside the branch this state can no longer reach once a
   * line goes unpainted mid-checkout. Left alone, the mobile sticky bar
   * (gated on `!checkoutOpen`) hides itself with nothing to show for it, and
   * the form pops back open unprompted the moment the last piece is painted.
   */
  useEffect(() => {
    if (hasUnpainted) setCheckoutOpen(false);
  }, [hasUnpainted]);
  useEffect(() => {
    onCheckoutOpenChange?.(checkoutOpen);
  }, [checkoutOpen, onCheckoutOpenChange]);
  useImperativeHandle(ref, () => ({ openCheckout: () => setCheckoutOpen(true) }), []);

  // ── Docked cart panel (shared by desktop right column + mobile inline section) ──
  const cartPanel = (
    <div className="flex flex-col gap-0" data-testid="docked-cart">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{t("cartTitle")}</h2>
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
        {hasConfig && (
          <span className="text-xs text-muted-foreground">
            {t.rich("paintedWith", {
              name: paintingLabel,
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

      {count === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
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
                    onN={(next) =>
                      setPaintN((m) => ({
                        ...m,
                        [line.id]: Math.min(Math.max(1, next), line.quantity),
                      }))
                    }
                    currentThumb={thumb}
                    palettes={palettes}
                    currentDesignSlug={designSlug}
                    pickerOpen={!!pickerOpenId[line.id]}
                    onTogglePicker={() =>
                      setPickerOpenId((m) => ({ ...m, [line.id]: !m[line.id] }))
                    }
                    onPickPalette={(code) => {
                      setRowPaletteCode((m) => ({ ...m, [line.id]: code }));
                      // Mockup `selPal`: choosing one closes the picker.
                      setPickerOpenId((m) => ({ ...m, [line.id]: false }));
                      // Fix wave A finding 5: ADR 0028 is LEAST-RECENTLY-
                      // USED — a palette picked here IS a use, same as
                      // `paintWith` touching it. Without this a palette
                      // used on rows all afternoon keeps its old `usedAt`
                      // and is first out of the LRU.
                      touchPalette(code, Date.now());
                    }}
                    // R5-BASKET-HOST task 2: step 3 always has a config on
                    // screen (the active design) — the drawer's step-1 "no
                    // config yet" case (`{ kind: "none" }`) doesn't apply
                    // here, so this stays step 3's own behaviour unchanged.
                    paintTarget={{ kind: "palette" }}
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
                  />
                );
              })}
          </div>

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

            {/* Task 13: `!hasUnpainted` gates the form shut even if it was
                already open when the basket picked up a new unpainted line
                (e.g. adding a ceramic mid-checkout) — the order can never
                leave with colourless pieces, so the form can never be on
                screen with one either (Task 4's client half). */}
            {!hasUnpainted && checkoutOpen ? (
              // scroll-mt: the mobile header is sticky and 56px tall, so a
              // bare scrollIntoView would park the form's first rows under it.
              // Fix wave PR3 finding 2: `md:scroll-mt-[4.5rem]` is that
              // desktop-header-only value, unchanged — but below `md` the
              // header now stacks with `paintingStrip`'s own `sticky top-14`
              // (task 13), ~111-117px combined, not 72px. Measured value below.
              <div
                data-testid="docked-checkout-form"
                className="scroll-mt-[7.5rem] md:scroll-mt-[4.5rem]"
              >
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
                {/* Task 13 (mockup: bottom of `renderS3`) — while anything is
                    unpainted, the pill that would open checkout is replaced,
                    not merely disabled: it becomes a tertiary "go paint it"
                    CTA that scrolls to and focuses the first unpainted row's
                    Paint button (`focusFirstUnpaintedRow`, shared with the
                    mobile bar in the next PR). No `arrow`: unlike "Bestill"
                    this click doesn't advance the funnel, matching the other
                    non-advancing pills in this stack (`new-design-cta`,
                    `share-set`) that also render arrow-less.
                    TODO:nb-review — cart.unpainted.cta NO copy is new,
                    unreviewed. */}
                {hasUnpainted ? (
                  <NextStepPill
                    variant="tertiary"
                    data-testid="docked-paint-first"
                    className="w-full"
                    label={t("unpainted.cta", { count: unpaintedInBasket })}
                    icon={
                      <PillIcon variant="tertiary">
                        <Brush className="size-5 text-muted-foreground" />
                      </PillIcon>
                    }
                    onClick={focusFirstUnpaintedRow}
                  />
                ) : (
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
                )}
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
      {/* R5-UNPAINTED task 11: the inverse of Paint. Rendered once, at the end
          of the step, driven by `unpaintId` — same pattern as `ProductSheet`
          above. `unpaint()` is the pure primitive's context wrapper
          (use-cart.ts); this component only decides WHEN and with WHAT n. */}
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
        onConfirmed={focusFirstUnpaintedRow}
      />

      {/* R5-BASKET-HOST task 3: the row thumb's photo viewer. Rendered once,
          at the end of the step, driven by `openPhotoId` — same pattern as
          `UnpaintDialog` right above (a `CartLine | null` + a ref that keeps
          rendering the last one through Radix's exit animation). No manual
          focus handling: the thumb button that opened it stays mounted, so
          Radix's own default `onCloseAutoFocus` returns focus there. */}
      <LineLightbox
        line={openPhotoLine}
        locale={locale}
        onOpenChange={(open) => !open && setOpenPhotoId(null)}
      />
    </>
  );
}
