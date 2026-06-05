"use client";

import { cn } from "@/lib/utils";

/**
 * Color option (kind=color, ADR 0004). The ONLY place where a raw hex
 * reaches the UI: it is catalog data, not theme. Rendered inside a
 * radiogroup; ≥44px touch target.
 */
export function Swatch({
  hex,
  name,
  selected = false,
  onSelect,
}: {
  hex: string;
  name: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={name}
      title={name}
      onClick={onSelect}
      style={{ backgroundColor: hex }}
      className={cn(
        "size-11 rounded-full border-2 border-card transition-shadow",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected
          ? "shadow-[0_0_0_2.5px_var(--ring)]"
          : "shadow-[0_0_0_1.5px_var(--border)]",
      )}
    />
  );
}
