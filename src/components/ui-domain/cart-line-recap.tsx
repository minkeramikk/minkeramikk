"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SetBadge } from "@/components/ui-domain/set-badge";
import type { CartLine } from "@/lib/cart/cart";

/**
 * R2 D — the rich per-line recap (composited preview + design selections +
 * ceramic + MK code), extracted from the step-3 docked cart so the side drawer
 * can reuse it IDENTICALLY. Self-contained code-copy; the "edit/reopen" action
 * differs per surface (router vs Sheet-closing link) → passed in via `editSlot`.
 * Reads everything from the line's `configSnapshot` (no new CartLine field).
 */
export function CartLineRecap({
  line,
  locale,
  editSlot,
}: {
  line: CartLine;
  locale: "no" | "en";
  editSlot?: React.ReactNode;
}) {
  const t = useTranslations("cart");
  const [copied, setCopied] = useState(false);
  const hex = line.configSnapshot?.selections.find((s) => s.hex)?.hex ?? undefined;
  // R2-6 G — colour-source badge (R2-2 rule): `customNote` is present (possibly
  // "") ONLY when the design accepts notes; absent otherwise. Non-empty ⇒ the
  // customer picked custom colours; "" ⇒ studio's complementary colours; absent
  // ⇒ design doesn't take notes → no badge.
  const note = line.configSnapshot?.customNote;
  const colourVariant = note === undefined ? null : note.trim() ? "custom" : "studio";

  async function copy() {
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
      data-testid="cart-line-detail"
      className="mt-3 flex flex-col gap-3 rounded-sm border border-primary/40 bg-card/55 p-3"
    >
      {colourVariant && (
        <span
          data-testid="colour-badge"
          data-variant={colourVariant}
          className="self-start rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          {colourVariant === "custom" ? t("colourBadge.custom") : t("colourBadge.studio")}
        </span>
      )}

      <span
        aria-hidden
        className="relative mx-auto block size-52 overflow-hidden rounded-md border border-border bg-card sm:size-56"
        style={
          !(line.layers && line.layers.length > 0) && hex
            ? { backgroundColor: hex }
            : undefined
        }
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

      {line.configSnapshot && (
        <dl className="flex flex-col gap-1">
          {line.configSnapshot.selections.map((s) => (
            <div key={s.label} className="flex items-center gap-2 text-xs">
              {s.hex && (
                <span
                  aria-hidden
                  className="size-3.5 shrink-0 rounded-full border border-border"
                  style={{ background: s.hex }}
                />
              )}
              <dt className="text-muted-foreground">
                {locale === "no" ? s.label : (s.labelEn ?? s.label)}
              </dt>
              <dd className="font-medium">{s.option}</dd>
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs">
            <dt className="text-muted-foreground">{t("line.ceramic")}</dt>
            <dd className="flex items-center gap-1.5 font-medium">
              {locale === "no" ? line.productNameNo : line.productNameEn}
              <SetBadge count={line.pieces ?? 1} />
            </dd>
          </div>
        </dl>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2.5">
        {line.configCode ? (
          <div className="flex min-w-0 items-center gap-2">
            <code className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
              {line.configCode}
            </code>
            <button
              type="button"
              data-testid="cart-copy-code"
              onClick={copy}
              className="shrink-0 text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {copied ? t("copied") : t("copyCode")}
            </button>
          </div>
        ) : (
          <span />
        )}
        {editSlot}
      </div>
    </div>
  );
}
