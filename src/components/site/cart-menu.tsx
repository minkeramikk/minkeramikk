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
 * trigger with its two badges, the sheet shell, and the count announcement.
 */
export function CartMenu() {
  const t = useTranslations("cart");
  const { cart, hydrated, open, setOpen, currentConfig } = useCartContext();
  const router = useRouter();
  const pathname = usePathname();
  /** The working URL the drawer is open over: everything the paint-first
   *  target has to preserve lives here except the two free-text fields, which
   *  come off `currentConfig`. See `paintFirstHref`. */
  const searchParams = useSearchParams();

  const count = itemCount(cart);
  // gate count on hydration to avoid SSR/client mismatch (cart starts empty)
  const liveCount = hydrated ? count : 0;
  // R5-UNPAINTED: pieces, not lines (unpaintedPieces), matching the header
  // marker's `○k` unit and the aria-label below.
  const unpainted = hydrated ? unpaintedPieces(cart) : 0;

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
   * «Paint N pieces first ›» from the drawer (the column just focuses its own
   * first unpainted row — `Basket`'s default). Here: close, go to step 3 of
   * whatever design is on screen, then hand focus to the row.
   *
   * The focus can't happen in the click: Radix restores focus to the trigger
   * when the sheet finishes closing, which would undo it, and while the exit
   * animation runs the drawer's OWN copy of the rows is still on screen — an
   * unscoped `focusFirstUnpaintedRow` would focus a dying node. So it rides
   * on `onCloseAutoFocus` (fires once the content is gone, right after the
   * trigger got focus back) and one frame later, without preventing Radix's
   * restore: if no row is found, focus stays on the cart button instead of
   * falling to `<body>`.
   *
   * ponytail: no pending-focus channel through the router. When the drawer is
   * already over step 3 — where this CTA matters — the column's rows are
   * mounted and this lands. Coming from step 1/2 the push is a real soft
   * navigation and step 3 may not have rendered within that frame, in which
   * case nothing is focused (the customer still arrives at step 3, scrolled
   * to the top). Making that case reliable needs a mechanism this task
   * deliberately did not invent — see the report.
   */
  const paintFirstRef = useRef(false);
  function handlePaintFirst() {
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
            // via a dedicated key so the sighted marker below can stay a glyph.
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
            {hydrated && unpainted > 0 && (
              <span
                data-testid="cart-badge-unpainted"
                aria-hidden
                className="absolute -bottom-0.5 right-1 text-[10px] leading-none font-semibold text-warn-on-dark"
              >
                ○{unpainted}
              </span>
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
          className="w-full! gap-0 p-0 sm:max-w-[420px]!"
          onCloseAutoFocus={() => {
            if (!paintFirstRef.current) return;
            paintFirstRef.current = false;
            requestAnimationFrame(() => focusFirstUnpaintedRow(document));
          }}
        >
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
