"use client";

import { useTranslations } from "next-intl";

/**
 * R5-KIT fix 8 — the strip above the step nav on a kit landing: what the kit
 * is, how many pieces, how many already painted. Pure props, no cart read
 * inside (steps 2 and 3 both supply the same two numbers). `title` is the
 * resolved shop-window label already (the caller reads it from the kit
 * context with `kitTitle`); the generic i18n fallback stays for kits with no
 * shop-window row.
 */
export function KitStrip({
  thumb,
  title,
  total,
  painted,
}: {
  thumb: React.ReactNode;
  title: string;
  total: number;
  painted: number;
}) {
  const t = useTranslations("kit.strip");
  return (
    <div
      data-testid="kit-strip"
      className="flex items-center gap-2.5 rounded-lg border border-border bg-secondary px-4 py-2 text-[12px]"
    >
      {thumb}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        <span className="block truncate text-muted-foreground">
          {t("subtitle", { count: total })}
        </span>
      </span>
      <span className="rounded-full bg-card px-2 py-1 text-[11px] ring-1 ring-border">
        {t("painted", { painted, total })}
      </span>
    </div>
  );
}
