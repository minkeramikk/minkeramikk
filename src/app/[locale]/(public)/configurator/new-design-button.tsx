"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * R3-C (final, Alessio 2026-06-28) — the single "Build a new design" CTA. It
 * lives in ONE place: a prominent secondary button right above "Send order" in
 * the cart panel. Same outline language as "Share this set" but full-size
 * (lg + full-width) so it reads as a real next step, not a footnote. Starts a
 * new design keeping the basket via goToStep(1) (logic in the caller). Copy
 * reuses the existing actions.newDesign string — no new i18n.
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
      variant="outline"
      size="lg"
      data-testid="new-design-cta"
      className={cn("min-h-11 w-full", className)}
      onClick={onClick}
    >
      + {ta("newDesign")}
    </Button>
  );
}
