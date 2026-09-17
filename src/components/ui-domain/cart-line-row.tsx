"use client";

import { useTranslations } from "next-intl";
import { Eraser, Trash2 } from "lucide-react";
import { CartLineThumb } from "@/components/ui-domain/cart-line-thumb";
import { SetBadge } from "@/components/ui-domain/set-badge";
import { formatMoney } from "@/lib/money/money";
import { designLabel, type CartLayer, type CartLine } from "@/lib/cart/cart";
import { formatSelections } from "@/lib/configurator/readable-selections";
import type { LineDiscount } from "@/lib/discounts/discount";

/**
 * First selection colour of a line → colour-chip fallback for CartLineThumb.
 * Moved here from ceramics-step.tsx (task 8): this row is now its only
 * caller — cart-menu.tsx (steps 1–2 drawer) keeps its own identical copy.
 */
function thumbHex(line: CartLine): string | undefined {
  return line.configSnapshot?.selections.find((s) => s.hex)?.hex ?? undefined;
}

/**
 * R5-UNPAINTED task 8 — the step-3 basket row (DESIGN-SYSTEM §3.14), rebuilt
 * as a grid around a line that may carry no colours (`configCode: null`).
 * Binding source: docs/revision5/mockup-palettebar.html, `Line(r)` («Step 3 ·
 * opzione A») — the icons on the Unpaint/Remove actions follow the mockup's
 * `Ico.unpaint`/`Ico.trash` glyphs (lucide `Eraser`/`Trash2` here; the task
 * brief's own "1:1" markup had dropped them, so the mockup wins per the card's
 * own tie-break rule).
 *
 * Owns NO state: `open`/`onToggleDetails` and every mutation arrive as props,
 * so this stays a pure render of whatever the parent's cart state is right
 * now — task 10 adds the "how many to paint" number the same way.
 *
 * Two gaps are left on purpose for the next cards:
 * - the unpainted actions row (task 10 — palette picker + Paint button);
 * - the details panel (task 12 — a new step-3 drilldown, NOT CartLineRecap,
 *   which stays legacy-only for the steps 1–2 drawer).
 * A painted line already gets a real quantity stepper and Remove here, so
 * nothing is unusable between commits.
 */
export function CartLineRow({
  line,
  locale,
  d,
  open,
  onToggleDetails,
  onQty,
  onRemove,
  onUnpaint,
  currentThumb,
}: {
  line: CartLine;
  locale: "no" | "en";
  d: LineDiscount;
  open: boolean;
  onToggleDetails: () => void;
  onQty: (quantity: number) => void;
  onRemove: () => void;
  /** Task 10 wires this to the real paint mutation; the row that would call
   *  it (the unpainted actions row) is that task's own gap. */
  onPaint: (n: number) => void;
  onUnpaint: () => void;
  currentThumb: { layers: CartLayer[]; label: string };
}) {
  // TODO:nb-review — cart.unpainted.* / cart.unpaint.action NO copy is new,
  // unreviewed (mirrors cart.buttonUnpainted's own "umalt/umalte" wording).
  const t = useTranslations("cart");
  const unpainted = line.configCode === null;

  return (
    <div
      data-testid="cart-line"
      data-unpainted={unpainted || undefined}
      className="border-b border-border/60 py-3 last:border-0"
    >
      <div className="grid grid-cols-[auto_1fr_auto] gap-x-3">
        <div className="row-span-2">
          <CartLineThumb
            unpainted={unpainted}
            layers={unpainted ? currentThumb.layers : line.layers}
            hex={thumbHex(line)}
            plateImage={line.plateImage}
          />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium leading-tight">
            <span className="truncate">
              {locale === "no" ? line.productNameNo : line.productNameEn}
            </span>
            {/* F29: legacy lines lack `pieces` → SetBadge renders nothing */}
            <SetBadge count={line.pieces ?? 1} className="shrink-0" />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {unpainted ? (
              <>
                <span className="text-warn">○ {t("unpainted.label")}</span>
                {" · "}
                {t("unpainted.pieces", { count: (line.pieces ?? 1) * line.quantity })}
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">
                  {designLabel(line.configSnapshot, locale) ?? "—"}
                </span>
                {line.configSnapshot && (
                  <span className="truncate">
                    · {formatSelections(line.configSnapshot.selections, locale)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span data-testid="cart-line-net" className="text-sm font-semibold tabular-nums">
            {formatMoney(d.net, locale)}
          </span>
          {d.pct > 0 && (
            <s
              data-testid="cart-line-full"
              aria-hidden
              className="text-[11px] tabular-nums text-muted-foreground"
            >
              {formatMoney(d.full, locale)}
            </s>
          )}
        </div>

        {/* actions row — task 10 (unpainted palette picker + Paint button).
            A painted line's quantity stepper is real now, not a gap: nothing
            between this commit and task 10 is left unusable. */}
        <div className="col-start-2 col-span-2 flex items-end">
          {!unpainted && (
            <div className="flex w-full items-center gap-1.5 pt-2">
              <div className="flex h-9 items-center rounded-sm border border-border bg-card">
                <button
                  type="button"
                  aria-label="-"
                  data-testid="docked-qty-dec"
                  onClick={() => onQty(line.quantity - 1)}
                  className="flex size-9 items-center justify-center"
                >
                  −
                </button>
                <span className="w-8 text-center text-sm tabular-nums">{line.quantity}</span>
                <button
                  type="button"
                  aria-label="+"
                  data-testid="docked-qty-inc"
                  onClick={() => onQty(line.quantity + 1)}
                  className="flex size-9 items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="col-span-3 mt-1.5 flex items-center justify-between text-[11px]">
          {unpainted ? (
            <span />
          ) : (
            <button
              type="button"
              data-testid="cart-expand"
              aria-expanded={open}
              onClick={onToggleDetails}
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {open ? `${t("line.collapse")} ▴` : `${t("line.expand")} ▾`}
            </button>
          )}
          <span className="flex items-center gap-3">
            {!unpainted && (
              <button
                type="button"
                data-testid="cart-unpaint"
                onClick={onUnpaint}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <Eraser className="size-3" aria-hidden />
                {t("unpaint.action")}
              </button>
            )}
            <button
              type="button"
              data-testid="docked-remove"
              onClick={onRemove}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="size-3" aria-hidden />
              {unpainted ? t("unpainted.removeAll") : t("remove")}
            </button>
          </span>
        </div>
        {/* details — task 12 (new step-3 drilldown; not CartLineRecap) */}
      </div>
    </div>
  );
}
