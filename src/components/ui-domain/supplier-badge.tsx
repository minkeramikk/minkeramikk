import { cn } from "@/lib/utils";

/**
 * Supplier badge (ADR 0007): whispers, never shouts. Outline-only pill;
 * the `onSelected` variant is used inside a selected OptionCard.
 */
export function SupplierBadge({
  name,
  onSelected = false,
  className,
}: {
  name: string;
  onSelected?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full border px-2 py-px text-[10px] uppercase tracking-[0.06em]",
        onSelected
          ? "border-primary-foreground/50 text-primary-foreground"
          : "border-border text-muted-foreground",
        className,
      )}
    >
      {name}
    </span>
  );
}
