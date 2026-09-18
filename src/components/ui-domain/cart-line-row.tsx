"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Brush, Eraser, Trash2 } from "lucide-react";
import { CartLineThumb } from "@/components/ui-domain/cart-line-thumb";
import { DesignRound } from "@/components/ui-domain/design-round";
import { SetBadge } from "@/components/ui-domain/set-badge";
import { formatMoney, money } from "@/lib/money/money";
import { designLabel, type CartLayer, type CartLine } from "@/lib/cart/cart";
import { formatSelections } from "@/lib/configurator/readable-selections";
import type { LineDiscount } from "@/lib/discounts/discount";

/**
 * First selection colour of a line → colour-chip fallback for CartLineThumb.
 * Moved here from ceramics-step.tsx (task 8): this row is now its only
 * caller — cart-menu.tsx (steps 1–2 drawer) keeps its own identical copy.
 * Exported (task 11): `UnpaintDialog`'s line card needs the exact same
 * fallback for the line it is unpainting — a second copy would drift.
 */
export function thumbHex(line: CartLine): string | undefined {
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
 * Task 12 fills the last gap: the details panel below, a step-3-only
 * drilldown (composed preview + config + ceramic + price) — NOT
 * `CartLineRecap`, which stays untouched and legacy-only for the steps 1–2
 * drawer (mockup `Line(r)`'s `open` block, `docs/revision5/mockup-palettebar.html`).
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
  onEditDesign,
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
  /** The details panel's «Edit design» action (fix round 2, blocker 1) —
   *  same `router.push` the step used pre-branch, owned by the parent since
   *  this row has no router of its own. */
  onEditDesign: () => void;
  /** How many of `line.quantity` the Paint button will move — owned by the
   *  parent (see class comment above), clamped there to [1, line.quantity]. */
  n: number;
  onN: (next: number) => void;
  currentThumb: { layers: CartLayer[]; label: string };
}) {
  // TODO:nb-review — cart.unpainted.* / cart.unpaint.action NO copy is new,
  // unreviewed (mirrors cart.buttonUnpainted's own "umalt/umalte" wording).
  const t = useTranslations("cart");
  const ta = useTranslations("actions");
  const unpainted = line.configCode === null;
  const isSet = (line.pieces ?? 1) > 1;
  // Fix round 2 (blocker 1) — same colour-source rule as the retired
  // `CartLineRecap`: `customNote` is present (possibly "") only when the
  // design takes notes; non-empty ⇒ custom colours, "" ⇒ studio's, absent ⇒
  // no badge.
  const note = line.configSnapshot?.customNote;
  const colourVariant = note === undefined ? null : note.trim() ? "custom" : "studio";
  const [copied, setCopied] = useState(false);
  async function copyCode() {
    if (!line.configCode) return;
    try {
      await navigator.clipboard.writeText(line.configCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

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
                <span className="text-warn-on-light">○ {t("unpainted.label")}</span>
                {" · "}
                {/* Fix round 2 (finding 7): the mockup prints the LINE's own
                    quantity, not physical pieces — a set-of-3 ×2 line is "2
                    sets", not "6 pieces". Same unit vocabulary as the unpaint
                    dialog, not a third one. */}
                {line.quantity}{" "}
                {t(isSet ? "unpaintDialog.unitSet" : "unpaintDialog.unitPiece", {
                  count: line.quantity,
                })}
              </>
            ) : (
              <>
                {/* Fix round 1 / task 8: the mockup's Line(r) puts a mini
                    design preview + a colour dot per selection here (Thumb +
                    Dots) — a legacy line without `layers` skips the preview,
                    same fallback CartLineThumb already uses. Ceramic size
                    (mockup's "· Ø 26 cm") is a deliberate gap: neither
                    CartLine nor configSnapshot carries a dimension field, and
                    adding one is model work this PR doesn't own. */}
                {line.layers && line.layers.length > 0 && (
                  <DesignRound layers={line.layers} className="size-4 rounded-sm" />
                )}
                <span className="font-medium text-foreground">
                  {designLabel(line.configSnapshot, locale) ?? "—"}
                </span>
                {line.configSnapshot && line.configSnapshot.selections.some((s) => s.hex) && (
                  <span className="inline-flex shrink-0 items-center gap-0.5">
                    {line.configSnapshot.selections
                      .filter((s) => s.hex)
                      .map((s) => (
                        <span
                          key={s.label}
                          aria-hidden
                          className="size-2.5 rounded-full border border-border"
                          style={{ background: s.hex ?? undefined }}
                        />
                      ))}
                  </span>
                )}
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
                <div
                  role="group"
                  aria-label={t("unpainted.paintCount")}
                  className="flex h-11 items-center rounded-sm border border-border bg-card sm:h-9"
                >
                  <button
                    type="button"
                    aria-label={t("decreaseQty")}
                    data-testid="paint-n-dec"
                    onClick={() => onN(Math.max(1, n - 1))}
                    className="flex size-11 items-center justify-center sm:size-9"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
                    {n}
                    <span className="text-muted-foreground">/{line.quantity}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={t("increaseQty")}
                    data-testid="paint-n-inc"
                    onClick={() => onN(Math.min(line.quantity, n + 1))}
                    className="flex size-11 items-center justify-center sm:size-9"
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
                  {/* TL change (fix round 1): badge reads from 2 upward, not
                      only the partial case — a 2-piece row at its default 2/2
                      showed NO badge before and only grew one after a −
                      press. Any row with more than one unit to choose from
                      always carries its current n; a single-unit row (n is
                      always 1 of 1, nothing to choose) still shows none. This
                      is a deliberate divergence from the mockup, which only
                      badges the partial case. */}
                  {line.quantity > 1 && (
                    <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-ink text-[10px] font-bold text-ink-foreground shadow">
                      {n}
                    </span>
                  )}
                </button>
              </>
            ) : (
              <div
                role="group"
                aria-label={t("quantity")}
                className="flex h-11 items-center rounded-sm border border-border bg-card sm:h-9"
              >
                <button
                  type="button"
                  aria-label={t("decreaseQty")}
                  data-testid="docked-qty-dec"
                  onClick={() => onQty(line.quantity - 1)}
                  className="flex size-11 items-center justify-center sm:size-9"
                >
                  −
                </button>
                <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
                  {line.quantity}
                </span>
                <button
                  type="button"
                  aria-label={t("increaseQty")}
                  data-testid="docked-qty-inc"
                  onClick={() => onQty(line.quantity + 1)}
                  className="flex size-11 items-center justify-center sm:size-9"
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="col-span-3 mt-1.5 flex items-center justify-between text-[11px]">
          {/* Fix round 2 (finding 9): a painted LEGACY line has no
              `configSnapshot` — the details panel below never renders one,
              so the toggle must not promise it either. */}
          {!unpainted && line.configSnapshot ? (
            <button
              type="button"
              data-testid="cart-expand"
              aria-expanded={open}
              onClick={onToggleDetails}
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {open ? `${t("line.collapse")} ▴` : `${t("line.expand")} ▾`}
            </button>
          ) : (
            <span />
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
        {/* Task 12 — step-3-only drilldown (mockup `open` block). `!unpainted`
            is belt-and-braces: the toggle button above never renders for an
            unpainted row, so `open` can't really be true here, but a line's
            id changes shape on paint/unpaint (see class comment) and this
            keeps the panel from ever reading a null `configSnapshot`.
            TODO:nb-review — cart.line.config / cart.line.price / cart.line.code
            NO copy is new, unreviewed (same batch as unpainted.cta below).
            Fix round 2 (blocker 1) — `cart-line-detail` (singular) is the
            SAME testid the retired `CartLineRecap` used: three e2e specs
            (config-code, share-set, r4-canvas-white-evidence) read a `<code>`
            and `cart-edit-design` out of whatever panel is here. This card
            replaces the COMPONENT, not the affordances it carried — code,
            copy, edit and the colour badge come back below, in the mockup's
            own `dl` idiom rather than a `CartLineRecap` re-import. */}
        {open && !unpainted && line.configSnapshot && (
          <div
            data-testid="cart-line-detail"
            className="col-span-3 mt-2 grid grid-cols-[112px_1fr] gap-4 rounded-sm border border-primary/30 bg-card/60 p-3"
          >
            {/* Composed preview, same compositing as CartLineThumb/CartLineRecap
                (multiply-blend the recolour layers) at the mockup's size-28 —
                this card's own preview, not a reuse of CartLineRecap's size-52. */}
            <span
              aria-hidden
              className="relative block size-28 overflow-hidden rounded-md border border-border bg-[var(--mk-canvas)]"
            >
              {(line.layers ?? []).map((l, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- composited catalog art from storage
                <img
                  key={`${l.src}-${i}`}
                  src={l.src}
                  alt=""
                  className="absolute inset-0 size-full object-contain"
                  style={l.recolor ? { mixBlendMode: "multiply" } : undefined}
                />
              ))}
            </span>

            <div className="flex min-w-0 flex-col gap-2">
              {colourVariant && (
                <span
                  data-testid="colour-badge"
                  data-variant={colourVariant}
                  className="self-start rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {colourVariant === "custom" ? t("colourBadge.custom") : t("colourBadge.studio")}
                </span>
              )}

              <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">{t("line.config")}</dt>
                <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold">
                    {formatSelections(line.configSnapshot.selections, locale)}
                  </span>
                  {line.configSnapshot.selections
                    .filter((s) => s.hex)
                    .map((s) => (
                      <span
                        key={s.label}
                        aria-hidden
                        data-testid="cart-line-config-dot"
                        className="size-3 rounded-full border border-border"
                        style={{ background: s.hex ?? undefined }}
                      />
                    ))}
                </dd>

                {/* Text position is card 6's — this row prints the inscription
                    alone, no position, until that card exists. */}
                {line.configSnapshot.customText && (
                  <>
                    <dt className="text-muted-foreground">{t("line.customText")}</dt>
                    <dd className="min-w-0 font-medium">«{line.configSnapshot.customText}»</dd>
                  </>
                )}

                <dt className="text-muted-foreground">{t("line.ceramic")}</dt>
                <dd className="flex flex-wrap items-center gap-1.5 font-medium">
                  {locale === "no" ? line.productNameNo : line.productNameEn}
                  <SetBadge count={line.pieces ?? 1} />
                  <span className="text-muted-foreground">
                    · {t("line.pieces", { count: (line.pieces ?? 1) * line.quantity })}
                  </span>
                </dd>

                <dt className="text-muted-foreground">{t("line.price")}</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums">
                    {formatMoney(money(line.unitPriceCents, line.currency), locale)} × {line.quantity}
                  </span>
                  {/* Discount tag: same `--discount` recipe as `CartLinePrice`
                      (cart-discount-row.tsx) — read for the colours, not
                      reinvented, per the card's own instruction; that file is
                      untouched. Only when the line is actually discounted. */}
                  {d.pct > 0 && (
                    <span
                      data-testid="cart-line-details-discount"
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap"
                      style={{
                        backgroundColor: "color-mix(in oklab, var(--discount) 16%, white)",
                        color: "color-mix(in oklab, var(--discount), black 34%)",
                        border: "1px solid color-mix(in oklab, var(--discount) 38%, white)",
                      }}
                    >
                      {d.coveredQty < d.quantity
                        ? t("discount.badgeCapped", { pct: d.pct, qty: d.coveredQty })
                        : t("discount.badge", { pct: d.pct })}
                    </span>
                  )}
                </dd>

                {/* Fix round 2 (blocker 1) — the config code + copy button,
                    restored from the retired `CartLineRecap` (same clipboard
                    handler, same `actions.copyCode`/`actions.copied` i18n
                    keys) in the mockup's own dt/dd idiom. Always present
                    here: this block only ever renders for a painted line,
                    which by construction has a non-null `configCode` — the
                    guard is for TypeScript, not a real empty case. */}
                {line.configCode && (
                  <>
                    <dt className="text-muted-foreground">{t("line.code")}</dt>
                    <dd className="flex min-w-0 items-center gap-2">
                      <code className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
                        {line.configCode}
                      </code>
                      <button
                        type="button"
                        data-testid="cart-copy-code"
                        onClick={copyCode}
                        className="shrink-0 text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        {copied ? ta("copied") : ta("copyCode")}
                      </button>
                    </dd>
                  </>
                )}
              </dl>

              {line.configCode && (
                <button
                  type="button"
                  data-testid="cart-edit-design"
                  onClick={onEditDesign}
                  className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  ✎ {t("line.edit")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
