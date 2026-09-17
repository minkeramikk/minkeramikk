"use client";

import { useTranslations } from "next-intl";
import { Brush, Eraser, Trash2 } from "lucide-react";
import { CartLineThumb } from "@/components/ui-domain/cart-line-thumb";
import { DesignRound } from "@/components/ui-domain/design-round";
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
 * Owns NO state: `open`/`onToggleDetails` and every mutation arrive as props
 * — task 10's "how many to paint" number (`n`) is no exception, it lives in
 * the parent's `Record<lineId, number>` (mirrors the mockup's `S3.n[id]`) and
 * arrives here as `n`/`onN`, so this stays a pure render of whatever the
 * parent's cart state is right now.
 *
 * One gap is left on purpose for the next card:
 * - the details panel (task 12 — a new step-3 drilldown, NOT CartLineRecap,
 *   which stays legacy-only for the steps 1–2 drawer).
 * A painted line already gets a real quantity stepper and Remove here, and
 * an unpainted one now gets its n/N paint selector, so nothing is unusable
 * between commits.
 */
export function CartLineRow({
  line,
  locale,
  d,
  open,
  onToggleDetails,
  onQty,
  onRemove,
  onPaint,
  onUnpaint,
  n,
  onN,
  currentThumb,
}: {
  line: CartLine;
  locale: "no" | "en";
  d: LineDiscount;
  open: boolean;
  onToggleDetails: () => void;
  onQty: (quantity: number) => void;
  onRemove: () => void;
  onPaint: (n: number) => void;
  onUnpaint: () => void;
  /** How many of `line.quantity` the Paint button will move — owned by the
   *  parent (see class comment above), clamped there to [1, line.quantity]. */
  n: number;
  onN: (next: number) => void;
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

        {/* actions row — the unpainted case is the n/N paint selector (task
            10); the palette PICKER the mockup opens from this same chip is
            task 12's card, not this one: here the chip is a static read of
            `currentThumb`, no menu, no ▾ affordance promising one. */}
        <div className="col-start-2 col-span-2 flex items-end">
          <div className="flex w-full items-center gap-1.5 pt-2">
            {unpainted ? (
              <>
                <span
                  data-testid="paint-chip"
                  className="flex h-9 items-center gap-1.5 rounded-sm border border-border bg-card pl-1 pr-2 text-xs font-medium"
                >
                  <DesignRound layers={currentThumb.layers} className="size-6 rounded-sm" />
                  <span className="max-w-[120px] truncate">{currentThumb.label}</span>
                </span>
                <div className="flex h-9 items-center rounded-sm border border-border bg-card">
                  <button
                    type="button"
                    aria-label="-"
                    data-testid="paint-n-dec"
                    onClick={() => onN(Math.max(1, n - 1))}
                    className="flex size-9 items-center justify-center"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm tabular-nums">
                    {n}
                    <span className="text-muted-foreground">/{line.quantity}</span>
                  </span>
                  <button
                    type="button"
                    aria-label="+"
                    data-testid="paint-n-inc"
                    onClick={() => onN(Math.min(line.quantity, n + 1))}
                    className="flex size-9 items-center justify-center"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  data-testid="paint-line"
                  onClick={() => onPaint(n)}
                  className="relative ml-auto flex h-9 items-center gap-1.5 rounded-sm bg-primary px-3.5 text-xs font-semibold text-primary-foreground"
                >
                  <Brush className="size-3.5" aria-hidden />
                  {t("unpainted.paint")}
                  {n < line.quantity && (
                    <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-ink text-[10px] font-bold text-ink-foreground shadow">
                      {n}
                    </span>
                  )}
                </button>
              </>
            ) : (
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
            )}
          </div>
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
