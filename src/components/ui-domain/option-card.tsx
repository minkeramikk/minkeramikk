"use client";

import { cn } from "@/lib/utils";
import { SupplierBadge } from "./supplier-badge";

/**
 * Selectable option in the configurator grids (DESIGN-SYSTEM §3.9).
 * Selecting a design locks the supplier for the item (ADR 0007).
 */
export function OptionCard({
  label,
  supplierName,
  imageUrl,
  selected = false,
  onSelect,
}: {
  label: string;
  supplierName?: string;
  imageUrl?: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "min-h-11 rounded-sm border-[1.5px] px-2.5 py-5 text-center text-sm transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        selected
          ? "border-primary bg-primary font-semibold text-primary-foreground"
          : "border-border bg-card text-foreground hover:border-ring",
      )}
    >
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- option art comes from storage, sized by grid
        <img src={imageUrl} alt="" className="mx-auto mb-2 h-14 w-14 object-contain" />
      )}
      <span className="block">{label}</span>
      {supplierName && (
        <SupplierBadge name={supplierName} onSelected={selected} className="mt-1.5" />
      )}
    </button>
  );
}
