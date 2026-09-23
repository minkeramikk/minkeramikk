"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * R5-KIT — passo 0: the welcome dialog on a kit landing. Both buttons close
 * (the tour R5-TUTORIAL wires them later); no persistence here.
 */
export function KitWelcome({
  open,
  onOpenChange,
  rows,
  total,
  image = null,
  imageCustom = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: { qty: number; name: string; image?: string }[];
  total: number;
  /** the kit's shop-window image, when a featured row carries this exact kit */
  image?: string | null;
  /** true when `image` is a custom upload (fills the frame, not round) */
  imageCustom?: boolean;
}) {
  const t = useTranslations("kit.welcome");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="kit-welcome"
        className="max-w-[360px] sm:max-w-[420px]"
      >
        <DialogHeader>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("eyebrow")}
          </p>
          {image && (
            <span
              className={`mt-2 mb-3 grid h-[160px] place-items-center overflow-hidden rounded-[13px] ${
                imageCustom
                  ? ""
                  : "bg-[color-mix(in_oklab,var(--mk-light),white_40%)]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- resolved catalog asset */}
              <img
                src={image}
                alt=""
                className={
                  imageCustom
                    ? "size-full object-cover"
                    : "size-[112px] rounded-full border border-border object-cover"
                }
              />
            </span>
          )}
          <DialogTitle className="text-[19px]">{t("title", { count: total })}</DialogTitle>
          <DialogDescription className="text-[13.5px]">{t("body")}</DialogDescription>
        </DialogHeader>
        <div className="mt-3 grid grid-cols-[auto_auto_1fr] items-center gap-x-2.5 gap-y-2.5 rounded-[11px] bg-muted px-3.5 py-3">
          {rows.map((r, i) => (
            <span key={`${r.name}-${i}`} className="contents">
              {r.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- resolved catalog asset
                <img
                  src={r.image}
                  alt=""
                  className="size-10 rounded-full border border-border object-cover grayscale"
                />
              ) : (
                <span className="size-10 rounded-full border border-border bg-card" />
              )}
              <span className="text-[14.5px] font-semibold tabular-nums">
                {r.qty}×
              </span>
              <span className="truncate text-[14.5px] leading-tight">{r.name}</span>
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            data-testid="kit-welcome-show"
            className="h-11 rounded-full bg-primary"
            onClick={() => onOpenChange(false)}
          >
            {t("show")}
          </Button>
          <Button
            type="button"
            data-testid="kit-welcome-self"
            variant="ghost"
            className="h-10 text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            {t("self")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Row names (+ piece photos) in the active locale for the welcome dialog. */
export function kitWelcomeRows(
  lines: {
    quantity: number;
    productNameNo: string;
    productNameEn: string;
    plateImage?: string;
  }[],
  locale: "no" | "en"
): { qty: number; name: string; image?: string }[] {
  return lines.map((l) => ({
    qty: l.quantity,
    name: locale === "no" ? l.productNameNo : l.productNameEn,
    image: l.plateImage,
  }));
}
