"use client";

import { useTranslations } from "next-intl";
import { ArrowLeftRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DesignRound } from "@/components/ui-domain/design-round";
import { useCartContext } from "@/lib/cart/cart-context";

/**
 * F40 — dialogo di scambio UNICO: stessa domanda per "salvo con slot pieno" e
 * "riprendo con carrello pieno", perché è lo stesso gesto (decisione di
 * prodotto 2). Montato una volta sola dentro CartProvider.
 * Niente X di chiusura: le due uscite sono Avbryt e Bytt (mockup pannello 3).
 */
export function SwapCartDialog() {
  const t = useTranslations("cart");
  const { cart, saved } = useCartContext();

  const current = cart[0]?.layers ?? [];
  const stored = saved.slot?.lines[0]?.layers ?? [];

  return (
    <Dialog open={saved.confirming !== null} onOpenChange={(o) => !o && saved.cancelSwap()}>
      <DialogContent data-testid="swap-cart-dialog" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("saved.swapTitle")}</DialogTitle>
          <DialogDescription>{t("saved.swapBody")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-3">
          <DesignRound layers={current} className="size-11" />
          <ArrowLeftRight className="size-5 text-primary" aria-hidden />
          <DesignRound layers={stored} className="size-11" />
        </div>
        <p className="text-center text-sm font-semibold">{t("saved.swapNothingLost")}</p>

        <DialogFooter>
          <Button
            variant="outline"
            className="min-h-11"
            data-testid="swap-cancel"
            onClick={saved.cancelSwap}
          >
            {t("saved.swapCancel")}
          </Button>
          <Button className="min-h-11" data-testid="swap-confirm" onClick={saved.confirmSwap}>
            {t("saved.swapConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
