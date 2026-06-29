"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * R3-C / R3-C-bis — the single "Build a new design" CTA. One component,
 * instantiated in the two step-3 points the card names: under the "Add to
 * basket" action (inside the expanded product card) and in the cart recap.
 * Low-emphasis on purpose (design critique): it's a secondary, flow-restart
 * action that must NOT compete with the primary "Add to basket" — hence a
 * compact ghost link, not a full-width button. Tap target stays ≥44px
 * (`min-h-11`). Logic (start a new design keeping the basket via goToStep(1))
 * lives once in the caller; this is presentation only. Copy reuses the existing
 * actions.newDesign string — no new i18n.
 */
export function NewDesignButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  const ta = useTranslations("actions");
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-testid="new-design-cta"
      className={cn(
        "min-h-11 gap-1 px-2 text-sm font-medium text-muted-foreground hover:bg-transparent hover:text-foreground",
        className
      )}
      onClick={onClick}
    >
      + {ta("newDesign")}
    </Button>
  );
}
