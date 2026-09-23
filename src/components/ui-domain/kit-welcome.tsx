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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: { qty: number; name: string; image?: string }[];
  total: number;
}) {
  const t = useTranslations("kit.welcome");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="kit-welcome"
        className="max-w-[330px] sm:max-w-[360px]"
      >
        <DialogHeader>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t("eyebrow")}
          </p>
          <DialogTitle>{t("title", { count: total })}</DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>
        <div className="mt-3 grid grid-cols-[auto_auto_1fr] items-center gap-x-2.5 gap-y-2 rounded-[11px] bg-muted px-3 py-2.5">
          {rows.map((r, i) => (
            <span key={`${r.name}-${i}`} className="contents">
              {r.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- resolved catalog asset
                <img
                  src={r.image}
                  alt=""
                  className="size-9 rounded-full border border-border object-cover grayscale"
                />
              ) : (
                <span className="size-9 rounded-full border border-border bg-card" />
              )}
              <span className="text-[13px] font-semibold tabular-nums">
                {r.qty}×
              </span>
              <span className="truncate text-[13px] leading-tight">{r.name}</span>
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
