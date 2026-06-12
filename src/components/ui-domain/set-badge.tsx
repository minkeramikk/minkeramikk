"use client";

import { useTranslations } from "next-intl";
import { isSet } from "@/lib/catalog/pieces";
import { cn } from "@/lib/utils";

/**
 * F29 — "Sett · N deler" pill marking a product that is a SET of N pieces
 * (`products.pieces > 1`). One visual language reused everywhere a set shows
 * up: step-3 ceramic card corner, hover-preview, cart row, F28 featured
 * strip. Renders nothing for a single item, so callers drop it in
 * unconditionally. Dark pill (`--ink`), matching the F28/admin set chip.
 */
export function SetBadge({
  count,
  className,
  testId = "set-badge",
}: {
  count: number;
  className?: string;
  /** override for callers with their own e2e hook (e.g. F28 strip). */
  testId?: string;
}) {
  const t = useTranslations("configurator");
  // robust against undefined/NaN (legacy cart lines, stale data): only a
  // genuine count > 1 shows the badge (shared isSet, F29)
  if (!isSet(count)) return null;
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-block rounded-full bg-ink px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.04em] text-ink-foreground",
        className,
      )}
    >
      {t("setBadge", { count })}
    </span>
  );
}
