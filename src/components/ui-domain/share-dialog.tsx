"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DesignRound } from "@/components/ui-domain/design-round";
import type { CartLayer } from "@/lib/cart/cart";

/**
 * R5-KIT — one Share button, a dialog that asks set or kit. `onPick` builds
 * the URL for the chosen kind (and copies it); the feedback states live here
 * so the step-3 footer and the mobile sticky bar share one behaviour.
 */
export type ShareKind = "set" | "kit";

export type ShareDialogState =
  | { kind: "copied" | "manual"; url: string }
  | { kind: "tooBig" }
  | { kind: "none" };

export function ShareDialog({
  open,
  onOpenChange,
  onPick,
  shareState,
  price,
  pieces,
  designLayers,
  kitThumb,
  notShareable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** build + copy the link for `kind`; resolves the URL (or null). */
  onPick: (kind: ShareKind) => Promise<string | null>;
  shareState: ShareDialogState | null;
  /** same number on both cards: basket net total, already formatted */
  price: string;
  pieces: number;
  designLayers: CartLayer[];
  /** first cart plateImage, when there is one (kit thumb) */
  kitThumb: string | null;
  notShareable: number;
}) {
  const t = useTranslations("cart.share");
  const [picked, setPicked] = useState<ShareKind | null>(null);

  const pick = async (kind: ShareKind) => {
    setPicked(kind);
    await onPick(kind);
  };

  const card = (kind: ShareKind, thumb: React.ReactNode) => (
    <button
      key={kind}
      type="button"
      data-testid={kind === "set" ? "share-as-set" : "share-as-kit"}
      onClick={() => pick(kind)}
      aria-pressed={picked === kind}
      className={`flex w-full items-start gap-3 rounded-[12px] border px-3 py-3 text-left ${
        picked === kind
          ? "border-primary bg-card shadow-[0_0_0_1px_var(--ring)]"
          : "border-border bg-card"
      }`}
    >
      {thumb}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          {kind === "set" ? t("asSet") : t("asKit")}
        </span>
        <span className="block text-xs text-muted-foreground">
          {kind === "set" ? t("asSetHint") : t("asKitHint")}
        </span>
        <span className="mt-1 block text-xs font-medium">
          {t("priceLine", { price, count: pieces })}
        </span>
      </span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="share-dialog" className="max-w-[380px]">
        <DialogHeader>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("eyebrow")}
          </p>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("lead")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {card(
            "set",
            <DesignRound layers={designLayers} className="size-11" />
          )}
          {card(
            "kit",
            kitThumb ? (
              // eslint-disable-next-line @next/next/no-img-element -- resolved catalog asset
              <img
                src={kitThumb}
                alt=""
                className="size-11 shrink-0 rounded-full border border-border object-cover"
              />
            ) : (
              <DesignRound layers={designLayers} className="size-11" />
            )
          )}
        </div>
        {picked && (
          <div aria-live="polite">
            {shareState && (
              <div
                data-testid="share-feedback"
                className="rounded-sm border border-primary/40 bg-primary/5 p-2.5 text-xs"
              >
                {shareState.kind === "tooBig" ? (
                  <p>{t("tooBig")}</p>
                ) : shareState.kind === "none" ? null : (
                  <>
                    <p className="font-medium">
                      {shareState.kind === "copied" ? t("copied") : t("manual")}
                    </p>
                    {/* the URL stays on screen in BOTH states: clipboard success
                        is invisible feedback, and the e2e locator reads <code> */}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t("linkLabel")}
                    </p>
                    <code className="mt-0.5 block select-all font-mono text-[10px] break-all text-muted-foreground">
                      {shareState.url}
                    </code>
                  </>
                )}
                {notShareable > 0 && (
                  <p
                    data-testid="share-not-shareable"
                    className="mt-1 text-muted-foreground"
                  >
                    {t("notShareable", { count: notShareable })}
                  </p>
                )}
              </div>
            )}
            {shareState?.kind === "manual" ? null : (
              <Button
                type="button"
                data-testid="share-copy"
                className="mt-2 h-10 w-full bg-primary"
                onClick={() => picked && pick(picked)}
              >
                {t("copy")}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
