"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * R3-C — the single "Build a new design" CTA. One component, instantiated in
 * the two step-3 points the card names (under the ceramic selector and in the
 * cart recap), visible on every viewport. Logic (start a new design keeping the
 * basket via goToStep(1)) lives once in the caller; this is presentation only.
 * Copy reuses the existing actions.newDesign string — no new i18n.
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
      className={cn("min-h-11", className)}
      onClick={onClick}
    >
      + {ta("newDesign")}
    </Button>
  );
}
