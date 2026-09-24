"use client";

import { useTranslations } from "next-intl";
import { ShoppingBag } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Basket, focusFirstUnpaintedRow } from "@/components/ui-domain/basket";
import { paintFirstHref } from "@/components/ui-domain/basket-host";
import { useCartContext } from "@/lib/cart/cart-context";
import { itemCount, unpaintedPieces } from "@/lib/cart/cart";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useTour } from "@/lib/tour/use-tour";
import { tipFor } from "@/lib/tour/tour";
import { CoachBar, useTourTip } from "@/components/ui-domain/tour";

/**
 * CartButton + CartDrawer (F16, DESIGN-SYSTEM §3.12). Lives in the public
 * header next to the locale switch; visible on every page/step. The drawer
 * (shadcn Sheet = Radix Dialog) gives focus-trap, Esc and focus-restore for
 * free. Cart data + mutations come from the shared `useCartContext` (single
 * source: badge, drawer and step 3 stay in sync). No hardcoded colours.
 *
 * R5-BASKET-HOST task 5 — «there are not two baskets». Everything below the
 * `SheetHeader` is `<Basket host="drawer">`, the very component step 3's
 * right column renders: rows, suggestion, totals, the fixed one-line foot
 * (total + saved + CTA), the empty state and the checkout form all live
 * there now. This file is down to what is genuinely the HEADER's: the
 * trigger with its badge and its warning dot, the sheet shell, and the count
 * announcement.
 */
export function CartMenu() {
  const t = useTranslations("cart");
  const { cart, hydrated, open, setOpen, currentConfig, palettes } = useCartContext();
  const router = useRouter();
  const pathname = usePathname();
  /** The working URL the drawer is open over: everything the paint-first
   *  target has to preserve lives here except the two free-text fields, which
   *  come off `currentConfig`. See `paintFirstHref`. */
  const searchParams = useSearchParams();

  const count = itemCount(cart);
  // gate count on hydration to avoid SSR/client mismatch (cart starts empty)
  const liveCount = hydrated ? count : 0;
  // R5-UNPAINTED: pieces, not lines (unpaintedPieces) — the unit the
  // aria-label below announces, and what the warning dot stands for.
  const unpainted = hydrated ? unpaintedPieces(cart) : 0;

  // R5-TUTORIAL 0.1-7 — 390, kit3: the open sheet already has a top edge, so
  // the CoachBar docks there instead of fixing to the viewport foot (DS
  // §3.32). This mount only ever cares about `sequence === "kit3"` — `step`
  // is fixed at 3 on purpose (the only step this drawer's own tour reaches;
  // a step2 tip stays on the page, `configurator-client.tsx`), and there's
  // no `KitWelcome`/`setBanner` state to read from here (the kit's own
  // welcome never coincides with kit3 — it's step 2's passo 0 — and a set
  // landing never sets `origin=kit`, so `kitMode` is false for it).
  const kitMode = searchParams.get("origin") === "kit" && (!hydrated || unpainted > 0);
  const tour = useTour();
  const tip = tipFor({
    state: tour.state,
    hydrated: tour.hydrated,
    kitMode,
    welcomeOpen: false,
    setBannerOpen: false,
    step: 3,
  });
  // `saved` — same `palettes.length` `ceramics-step.tsx`'s own PaletteCard
  // uses — feeds kit3's 2nd tip (remapped to `step3.1`'s plural, Task C).
  const tourTip = useTourTip(tip, { count: unpainted, saved: palettes.length });
  const showKit3CoachBar = open && tip?.sequence === "kit3" && tourTip !== null;
  const handleTourNext = () => {
    if (!tip || !tourTip) return;
    if (tourTip.last) tour.turnOff();
    else tour.next(tip.sequence);
  };

  // R2-6 C: pop the badge when the count GROWS (an item was added) — a mobile
  // cue pointing at the cart. Decorative only; the count is already announced
  // via the aria-live region below, so no new announcement.
  const [pulse, setPulse] = useState(false);
  const prevCount = useRef(0);
  useEffect(() => {
    if (!hydrated) {
      prevCount.current = count;
      return;
    }
    if (count > prevCount.current) {
      setPulse(true);
      const id = setTimeout(() => setPulse(false), 450);
      prevCount.current = count;
      return () => clearTimeout(id);
    }
    prevCount.current = count;
  }, [count, hydrated]);

  /**
   * Task 5: the drawer is mounted in the PERSISTENT header, so a route change
   * no longer unmounts it. Until this task the order form lived in this file
   * and closed the sheet itself on success; it lives in `<Basket>` now and
   * only knows how to redirect to `/order`, which would leave an open drawer
   * (showing the freshly cleared, empty basket) sitting over the thank-you
   * page. One rule here beats a closer threaded through every navigating
   * child. `setOpen` is a plain state setter, so the mount run is a no-op.
   */
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  /**
   * «Paint N pieces first ›» from the drawer. It has to land the customer on a
   * row they can press Paint on, and since PR 2 there are two answers to
   * «which rows», decided by whether the step-3 column is on screen:
   *
   * - column on screen (from `lg`): close, go to step 3 of whatever design is
   *   on screen, hand focus to the row there — unchanged behaviour.
   * - no column (below `lg`): the drawer's own rows are the ONLY rows, because
   *   task 6 deleted the in-flow copy. So the drawer STAYS OPEN and the focus
   *   lands on the Paint button already under the customer's thumb. Closing
   *   would take away the very thing this CTA points at, which is what it did
   *   between task 6 and this fix.
   *
   * The question is asked of the LAYOUT, not of a second copy of its rule: the
   * column is `hidden lg:block`, so below `lg` it sits in the DOM with no
   * `offsetParent` — the same "is it on screen" test `focusFirstUnpaintedRow`
   * applies to the rows themselves. No `matchMedia("64rem")` here to drift out
   * of step with the class list over there.
   *
   * No column element at all means we are not on step 3, and then the push is
   * the only way to reach a column: that keeps today's behaviour at every
   * width (below `lg` it arrives at step 3 with nothing focused, the gap
   * recorded in R5-GARANZIA.md §1 — not this card's to close).
   *
   * In the closing branch the focus can't happen in the click: Radix restores
   * focus to the trigger when the sheet finishes closing, which would undo it,
   * and while the exit animation runs the drawer's OWN copy of the rows is
   * still on screen — an unscoped `focusFirstUnpaintedRow` would focus a dying
   * node. So it rides on `onCloseAutoFocus` (fires once the content is gone,
   * right after the trigger got focus back) and one frame later, without
   * preventing Radix's restore: if no row is found, focus stays on the cart
   * button instead of falling to `<body>`.
   */
  const paintFirstRef = useRef(false);
  function handlePaintFirst() {
    const column = document.querySelector<HTMLElement>(
      '[data-testid="docked-cart-panel"]'
    );
    if (column && !column.offsetParent) {
      focusFirstUnpaintedRow(
        document.querySelector('[data-testid="cart-drawer"]') ?? document
      );
      return;
    }
    paintFirstRef.current = true;
    setOpen(false);
    // Final-review finding 4a: the target is the URL we are ALREADY on with
    // `code`/`step` set on top of it — not one rebuilt from the code alone.
    // The code never encodes the note or the inscription (`line-payload.ts`);
    // those travel as `note=`/`text=` and a from-scratch push dropped them,
    // so the customer's own words never reached the order mail or the lab
    // PDF. Even at step 3 the push is NOT a no-op: it rewrites the query (the
    // comment that used to claim otherwise is what let this through).
    // `paintFirstHref` — pure, unit-tested in basket.test.ts.
    router.push(paintFirstHref(searchParams, currentConfig));
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            data-testid="cart-button"
            // R5-UNPAINTED: the header keeps its icon+badge, no text pill (TL
            // decision) — the unpainted count rides in the aria-label instead,
            // via a dedicated key — and it stays there now that the sighted
            // marker below is a dot with no number in it at all (task 7).
            // TODO:nb-review — cart.buttonUnpainted NO copy is new, unreviewed.
            aria-label={
              unpainted > 0
                ? t("buttonUnpainted", { count: liveCount, unpainted })
                : t("button", { count: liveCount })
            }
            aria-haspopup="dialog"
            className="relative -mr-1.5 flex size-11 items-center justify-center rounded-lg text-ink-muted transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <ShoppingBag className="size-5" aria-hidden />
            {hydrated && count > 0 && (
              <span
                data-testid="cart-badge"
                className={cn(
                  "absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular-nums",
                  pulse && "motion-safe:max-md:[animation:cart-pop_0.4s_ease]"
                )}
              >
                {count}
              </span>
            )}
            {/* Task 7 (card §4-quinquies, QA 19/9 — option B): a DOT, not a
                second number. Two unlabelled numbers fought over the same
                20px bag and neither read at true size; «how many» is not
                actionable from the header anyway — to act you open the
                basket, where the count is already in the info box and in
                «Paint N pieces first». So the badge says one thing: there
                is something left to finish. The ring is the header's own
                `--ink`, which is what lifts the dot off the bag's stroke.
                `--warn` full strength as the ruling asks: it is a graphic,
                not text (3.6:1 on the header clears the 3:1 that 1.4.11
                asks of non-text), so the `warn-on-dark` variant the glyph
                needed for 4.5:1 is not needed here.
                The count itself is NOT lost: it rides in the button's
                `aria-label` above, same key as before. */}
            {hydrated && unpainted > 0 && (
              <span
                data-testid="cart-badge-unpainted"
                aria-hidden
                className="absolute bottom-1 right-1.5 size-2 rounded-full bg-warn ring-2 ring-ink"
              />
            )}
          </button>
        </SheetTrigger>

        <SheetContent
          side="right"
          data-testid="cart-drawer"
          // 420 (was 380): the unified row's actions line (chip · n/N · Paint)
          // is what sets the floor now. Full width below `sm` was already
          // here; the base `Sheet`'s own `w-3/4` is shared with every other
          // sheet and is not touched.
          // PR 2 review: AC 4 names ✕ as a required way to close the drawer,
          // and the shared `Sheet` draws it `size-icon-sm` = 28px. Widened
          // from the drawer's OWN className (card §2: never touch the shared
          // component), so every other sheet keeps its 28px.
          // R5-POLISH-STEP23 (TL, 22/9): white like the step-3 basket panel —
          // the two hosts of `Basket` now share the surface as well as the
          // markup, so the drawer never reads as a different component.
          className="w-full! gap-0 bg-[var(--mk-canvas)] p-0 sm:max-w-[420px]! [&>[data-slot=sheet-close]]:size-11"
          onCloseAutoFocus={() => {
            if (!paintFirstRef.current) return;
            paintFirstRef.current = false;
            requestAnimationFrame(() => focusFirstUnpaintedRow(document));
          }}
        >
          {/* R5-TUTORIAL 0.1-7 — the kit3 CoachBar becomes the sheet's own
              header band, first child of `SheetContent` (DS §3.32: "il
              foglio arriva già aperto" — the bar docks to ITS top edge, not
              the viewport's). Always before `SheetHeader`, never a second
              strip stacked under it. */}
          {showKit3CoachBar && tip && tourTip && (
            <CoachBar
              inSheet
              n={tip.n}
              text={tourTip.text}
              last={tourTip.last}
              onNext={handleTourNext}
              onOff={() => tour.turnOff()}
            />
          )}
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle>{t("cartTitle")}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("description")}
            </SheetDescription>
          </SheetHeader>

          {/* `Basket`'s drawer host is `h-full` (it owns the scroller and the
              fixed foot), so it needs a sized flex child to be full OF. */}
          <div className="min-h-0 flex-1">
            <Basket
              host="drawer"
              currentConfig={currentConfig}
              // Finding 5: an unpainted row carries no `configSnapshot`, so
              // without this its «choose colours» chip always pointed at the
              // bare `/configurator` — step 1 with the catalog's first
              // design. The URL the drawer is open over knows which design
              // the customer is looking at.
              fallbackDesignSlug={searchParams.get("design")}
              onAddCeramics={() => setOpen(false)}
              onPaintFirst={handlePaintFirst}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* discreet screen-reader announcement of the count */}
      <span aria-live="polite" className="sr-only">
        {hydrated && count > 0 ? t("button", { count }) : ""}
      </span>
    </>
  );
}
