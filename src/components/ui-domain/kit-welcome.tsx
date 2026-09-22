"use client";

import { useTranslations, useLocale } from "next-intl";
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
  rows: { qty: number; name: string }[];
  total: number;
}) {
  const t = useTranslations("kit.welcome");
  const locale = useLocale();
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
        <ul className="rounded-[11px] bg-muted px-3 py-2 text-sm">
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`} className="flex justify-between gap-2 py-0.5">
              <span className="font-medium tabular-nums">{r.qty}×</span>
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
            </li>
          ))}
        </ul>
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

/** Row names in the active locale for the welcome dialog. */
export function kitWelcomeRows(
  lines: { quantity: number; productNameNo: string; productNameEn: string }[],
  locale: "no" | "en"
): { qty: number; name: string }[] {
  return lines.map((l) => ({
    qty: l.quantity,
    name: locale === "no" ? l.productNameNo : l.productNameEn,
  }));
}
