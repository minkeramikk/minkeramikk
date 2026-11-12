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
 * R5-KIT-WELCOME-COPY — which `kit.welcome.*` keys each landing reads. A kit
 * still has colours to choose; a shared set is already designed, so it gets
 * its own title, body and CTA.
 * TODO:nb-review — NO copy is ours (card), unreviewed: kit.welcome.body,
 * kit.welcome.setTitle, kit.welcome.setBody, kit.welcome.setCta.
 */
export const KIT_WELCOME_KEYS = {
  kit: { title: "title", body: "body", cta: "cta" },
  set: { title: "setTitle", body: "setBody", cta: "setCta" },
} as const;

/**
 * R5-KIT — passo 0: the welcome dialog on a kit landing, and (R5-KIT-CONFIRM)
 * on a shared-set landing too. It only LISTS the pieces: nothing is in the
 * cart until the CTA. `onConfirm` is the CTA and nothing else; ×, Esc and the
 * overlay reach the caller as `onOpenChange(false)` — a dismiss. The caller
 * owns `open`, so it closes the dialog itself in both. No persistence here.
 */
export function KitWelcome({
  open,
  onOpenChange,
  rows,
  total,
  image = null,
  imageCustom = false,
  eyebrow,
  variant = "kit",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: { qty: number; name: string; image?: string }[];
  total: number;
  /** the kit's shop-window image, when a featured row carries this exact kit */
  image?: string | null;
  /** true when `image` is a custom upload (fills the frame, not round) */
  imageCustom?: boolean;
  /** the resolved shop-window label (caller reads it via `kitTitle`) */
  eyebrow: string;
  /** which copy: a kit (colours to choose) or an already designed set */
  variant?: keyof typeof KIT_WELCOME_KEYS;
  /** the CTA («Tilpass settet» on a kit, «Legg i handlekurven» on a set): the caller adds the listed pieces, closes, and (kit)
   *  starts the tour (R5-TUTORIAL passo 0). */
  onConfirm: () => void;
}) {
  const t = useTranslations("kit.welcome");
  const keys = KIT_WELCOME_KEYS[variant];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="kit-welcome"
        className="max-w-[360px] sm:max-w-[420px]"
      >
        <DialogHeader>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {eyebrow}
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
          <DialogTitle className="text-[19px]">{t(keys.title, { count: total })}</DialogTitle>
          <DialogDescription className="text-[13.5px]">{t(keys.body)}</DialogDescription>
        </DialogHeader>
        {/* R5-TUTORIAL round 2 (plan Task D) — the per-row photos become
            protagonists: bigger (size-10 → size-16, ~64px) and in colour
            (grayscale dropped), `rounded-xl` instead of round to read as
            small photo cards rather than avatars. Layout otherwise
            untouched — same 3-column grid, same qty/name columns, same
            missing-image placeholder (never invents a photo). */}
        <div className="mt-3 grid grid-cols-[auto_auto_1fr] items-center gap-x-3 gap-y-3 rounded-[11px] bg-muted px-3.5 py-3">
          {rows.map((r, i) => (
            <span key={`${r.name}-${i}`} className="contents">
              {r.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- resolved catalog asset
                <img
                  src={r.image}
                  alt=""
                  className="size-16 rounded-xl border border-border object-cover"
                />
              ) : (
                <span className="size-16 rounded-xl border border-border bg-card" />
              )}
              <span className="text-[14.5px] font-semibold tabular-nums">
                {r.qty}×
              </span>
              <span className="truncate text-[14.5px] leading-tight">{r.name}</span>
            </span>
          ))}
        </div>
        {/* Alessio (copy review 8/10): ONE button, «Tilpass settet». It keeps
            the primary action the old «Vis meg hvordan» had — close and start
            the tour; the «Jeg ser selv» (tips off for good) button is gone
            with it. R5-KIT-CONFIRM: it is also the ONLY thing that puts the
            pieces in the cart — the dialog's own × leaves it untouched. */}
        <Button
          type="button"
          data-testid="kit-welcome-show"
          className="h-11 rounded-full bg-primary"
          onClick={onConfirm}
        >
          {t(keys.cta)}
        </Button>
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
