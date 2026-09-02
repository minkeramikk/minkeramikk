"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CLOSE_DISC } from "@/components/ui-domain/close-disc";
import { SheetOfferBlock } from "@/components/ui-domain/sheet-offer-block";
import type { ActiveSuggestion } from "@/lib/discounts/discount";
import { cn } from "@/lib/utils";

/**
 * R4-UPSELL-POST-ADD ③ (DESIGN-SYSTEM §3.19 / §3.24) — what comes up AFTER
 * «Legg i handlekurv», when the add unlocked something.
 *
 * It is the second half of one gesture: the sheet closes, this opens. TWO
 * dialogs in sequence, never one nested inside the other and never the sheet
 * kept open with its body hidden — Radix's `hideOthers`, the focus scope and
 * the scroll lock are all per-content, and stacking a panel inside a sheet that
 * is pretending to be closed breaks all three.
 *
 * Same responsive shell as the product sheet (§3.19): ONE Dialog with
 * breakpoint classes — bottom sheet below 640, centred dialog above — never two
 * components swapped on a JS media query, which would unmount mid-interaction.
 *
 * What it says, top to bottom: the add happened («✓ Lagt i handlekurven», then
 * «{qty} × {name}»), then the offers as cards, then one button that closes.
 * The upsell is always a CHOICE: nothing here is added on the customer's
 * behalf, and «Legg til» on a card does not close the panel — only «Fortsett å
 * handle» (and ✕, Esc, the backdrop) does. There is no «Se handlekurven»: the
 * basket is one tap away in the header and a second route out of this panel
 * would be a fork nobody asked for.
 *
 * TODO:nb-review NO copy: cart.added.*
 */
export function AddedSheet({
  open,
  onOpenChange,
  addedQty,
  addedName,
  offers,
  takenRuleIds,
  onTake,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The line that was just added — what the confirmation names. */
  addedQty: number;
  addedName: string;
  /** Offers the updated basket unlocks, in the admin's order. Never empty when
   *  the panel is open: the caller opens it only when there is something. */
  offers: ActiveSuggestion[];
  takenRuleIds: string[];
  onTake: (offer: ActiveSuggestion) => void;
  locale: "no" | "en";
}) {
  const t = useTranslations("cart.added");

  /**
   * a11y (§3.19), same contract as `ProductSheet`: focus goes back to whatever
   * opened this — which, through the sheet's own restore, is the grid card the
   * customer pressed. Radix's modal content preventDefaults FocusScope's restore
   * and aims at a `DialogTrigger` this panel does not have, so without it focus
   * falls to <body>.
   */
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) trigger.current = document.activeElement as HTMLElement | null;
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        data-testid="added-sheet"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          trigger.current?.focus();
        }}
        overlayClassName="bg-foreground/70 supports-backdrop-filter:backdrop-blur-none"
        className={cn(
          // Same shell as §3.19 — bottom sheet below 640, centred above. The
          // panel is shorter than the sheet, so it takes a narrower desktop box.
          "top-auto bottom-0 left-1/2 w-full max-w-none! -translate-x-1/2 translate-y-0",
          "max-h-[88dvh] overflow-y-auto rounded-t-lg rounded-b-none",
          "px-4 pt-[26px] pb-[calc(14px+env(safe-area-inset-bottom))]",
          "shadow-[0_12px_40px_color-mix(in_oklab,var(--foreground)_28%,transparent)]",
          "sm:top-1/2 sm:bottom-auto sm:max-h-[90vh] sm:w-[min(520px,96vw)] sm:max-w-none!",
          "sm:-translate-y-1/2 sm:rounded-lg sm:p-5",
          "ease-out duration-[220ms] sm:duration-[180ms]",
          "data-open:fade-in-100! data-open:zoom-in-100! data-open:slide-in-from-bottom-[24%]!",
          "sm:data-open:fade-in-60! sm:data-open:zoom-in-[0.97]! sm:data-open:slide-in-from-bottom-0!",
          "motion-reduce:animate-none!"
        )}
      >
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={t("continue")}
          data-testid="added-sheet-close"
          className={cn("absolute top-2.5 right-3 z-2", CLOSE_DISC)}
        >
          ✕
        </button>

        <div className="flex flex-col gap-3.5">
          <div className="flex items-center gap-3 pt-1 pr-11">
            {/* The ✓ disc, same recipe as the taken card's — `--discount`, no
                hardcoded colour. 40px here: it is the panel's own headline. */}
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-full text-lg font-semibold"
              style={{
                backgroundColor: "color-mix(in oklab, var(--discount) 18%, white)",
                color: "color-mix(in oklab, var(--discount), black 36%)",
                border: "1px solid color-mix(in oklab, var(--discount) 40%, white)",
              }}
            >
              ✓
            </span>
            <div className="min-w-0">
              {/* The dialog's accessible name IS the confirmation — one node,
                  no sr-only duplicate to be read twice. */}
              <DialogTitle className="text-[17px] leading-snug font-semibold">
                {t("title")}
              </DialogTitle>
              <p data-testid="added-sheet-line" className="text-[13px] text-muted-foreground">
                {t("line", { qty: addedQty, name: addedName })}
              </p>
            </div>
          </div>

          <SheetOfferBlock
            offers={offers}
            locale={locale}
            takenRuleIds={takenRuleIds}
            onTake={onTake}
          />

          <Button
            size="lg"
            className="min-h-11 w-full"
            data-testid="added-sheet-continue"
            onClick={() => onOpenChange(false)}
          >
            {t("continue")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
