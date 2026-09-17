"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Eraser } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CartLineThumb } from "@/components/ui-domain/cart-line-thumb";
import { DesignRound } from "@/components/ui-domain/design-round";
import { NextStepPill, PillIcon } from "@/components/ui-domain/next-step-pill";
import { thumbHex } from "@/components/ui-domain/cart-line-row";
import { designLabel, type CartLine } from "@/lib/cart/cart";
import { cn } from "@/lib/utils";

/**
 * R5-UNPAINTED task 11 — the inverse of Paint (task 10): take the colours off
 * a painted line, n of its N pieces at a time. Binding source:
 * docs/revision5/mockup-palettebar.html, `UnpaintDialog()` — its markup and
 * classes are the spec.
 *
 * That function's own comment says it wears "la stessa veste del Dialog di
 * onboarding del kit (ring-1, rounded-xl, bg-popover, sm:max-w-sm)" — that IS
 * this site's default `DialogContent` (dialog.tsx) unstyled. Unlike
 * `AddedSheet` (§3.19's heavy bottom-sheet override) this dialog adds NO
 * layout className of its own; it only copies `AddedSheet`'s a11y contract:
 * `showCloseButton={false}`, `aria-describedby={undefined}`, and the same
 * `onCloseAutoFocus` that returns focus to whatever opened it (the row's
 * "Unpaint…" link, which is not a `DialogTrigger`, so without this focus would
 * fall to `<body>`). Radix gives Esc and the backdrop for free (AC6).
 *
 * The counting unit is UNITS, not physical pieces (mirrors the row's own n/N
 * paint stepper, task 10): a set of 4 counts as one when the customer picks
 * "how many", so the copy says "set/sets" for a line whose `pieces > 1` and
 * "piece/pieces" otherwise — exactly the mockup's `one`/`many` split.
 *
 * TODO:nb-review NO copy: cart.unpaintDialog.* is new, unreviewed.
 */
export function UnpaintDialog({
  line,
  locale,
  onOpenChange,
  onConfirm,
}: {
  /** The painted line being unpainted, or null when the dialog is closed.
   *  Always a painted line: the row only renders "Unpaint…" on those. */
  line: CartLine | null;
  locale: "no" | "en";
  onOpenChange: (open: boolean) => void;
  /** The caller owns the actual move (`unpaint(lineId, n)`) and closes. */
  onConfirm: (n: number) => void;
}) {
  const t = useTranslations("cart.unpaintDialog");
  const open = line !== null;

  // Same a11y contract as `AddedSheet` (§3.19): focus goes back to whatever
  // opened this — the row's "Unpaint…" link, read here rather than assumed,
  // exactly like AddedSheet reads the grid card that opened IT.
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) trigger.current = document.activeElement as HTMLElement | null;
  }, [open]);

  // How many of `line.quantity` to unpaint — starts at 1 (mockup: `unpaint(id)`
  // sets `S3.dlg={id,n:1}`), never at N: unpainting is opt-in per piece.
  const [n, setN] = useState(1);
  useEffect(() => {
    if (line) setN(1);
    // Reset only when a DIFFERENT line opens, not on every render of the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.id]);

  // ceramics-step.tsx clears the id (and so `line`) the instant `onConfirm`
  // fires, so Radix's exit animation would otherwise render an empty dialog
  // for its last 100ms. Keep the last non-null line around for that.
  const lastLine = useRef<CartLine | null>(null);
  if (line) lastLine.current = line;
  const shown = line ?? lastLine.current;
  if (!shown) return null;

  const isSet = (shown.pieces ?? 1) > 1;
  const unitKey = isSet ? "unitSet" : "unitPiece";
  const unitForN = t(unitKey, { count: n });
  const unitForAll = t(unitKey, { count: shown.quantity });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        data-testid="unpaint-dialog"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          trigger.current?.focus();
        }}
      >
        <div className="flex items-center gap-2 text-primary">
          <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
            <Eraser className="size-3.5" aria-hidden />
          </span>
          <b className="text-[12px] font-semibold uppercase tracking-[0.08em]">
            {t("eyebrow")}
          </b>
        </div>

        <DialogTitle className="text-xl leading-tight font-semibold">
          {t("title")}
        </DialogTitle>

        <p className="text-muted-foreground">
          {t.rich("body", {
            unit: unitForAll,
            b: (chunks) => <b className="font-semibold text-foreground">{chunks}</b>,
          })}
        </p>

        <div className="flex items-center gap-3 rounded-sm border border-border bg-card p-3">
          <CartLineThumb
            layers={shown.layers}
            hex={thumbHex(shown)}
            plateImage={shown.plateImage}
          />
          <span className="min-w-0 leading-tight">
            <b className="block truncate text-[15px] font-semibold">
              {locale === "no" ? shown.productNameNo : shown.productNameEn}
            </b>
            <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
              {shown.layers && shown.layers.length > 0 && (
                <DesignRound layers={shown.layers} className="size-4 rounded-sm" />
              )}
              <span className="font-medium text-foreground">
                {designLabel(shown.configSnapshot, locale) ?? "—"}
              </span>
              {shown.configSnapshot?.selections.some((s) => s.hex) && (
                <span className="inline-flex shrink-0 items-center gap-0.5">
                  {shown.configSnapshot.selections
                    .filter((s) => s.hex)
                    .map((s) => (
                      <span
                        key={s.label}
                        aria-hidden
                        className="size-2.5 rounded-full border border-black/10"
                        style={{ background: s.hex ?? undefined }}
                      />
                    ))}
                </span>
              )}
              <span>
                · {shown.quantity} {unitForAll}
              </span>
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">{t("howMany")}</span>
          <div className="ml-auto flex h-10 items-center rounded-sm border border-border bg-card">
            <button
              type="button"
              aria-label="-"
              data-testid="unpaint-n-dec"
              onClick={() => setN((v) => Math.max(1, v - 1))}
              className="flex size-10 items-center justify-center text-base"
            >
              −
            </button>
            <span className="w-10 text-center text-base font-semibold tabular-nums">
              {n}
            </span>
            <button
              type="button"
              aria-label="+"
              data-testid="unpaint-n-inc"
              onClick={() => setN((v) => Math.min(shown.quantity, v + 1))}
              className="flex size-10 items-center justify-center text-base"
            >
              +
            </button>
          </div>
          <button
            type="button"
            data-testid="unpaint-n-all"
            onClick={() => setN(shown.quantity)}
            className={cn(
              "h-10 rounded-sm border border-border bg-card px-3 text-xs font-medium",
              n === shown.quantity && "border-primary shadow-[0_0_0_1px_var(--ring)]"
            )}
          >
            {t("all", { n: shown.quantity })}
          </button>
        </div>

        <NextStepPill
          data-testid="unpaint-confirm"
          arrow
          icon={
            <PillIcon>
              <Eraser className="size-5 text-primary" />
            </PillIcon>
          }
          label={t("confirm", { n, unit: unitForN })}
          onClick={() => onConfirm(n)}
        />

        <button
          type="button"
          data-testid="unpaint-cancel"
          onClick={() => onOpenChange(false)}
          className="justify-self-center text-xs text-muted-foreground underline underline-offset-2"
        >
          {t("keepPainted")}
        </button>
      </DialogContent>
    </Dialog>
  );
}
