"use client";

import { Bookmark } from "lucide-react";
import { useTranslations } from "next-intl";
import { NextStepPill, PillIcon } from "./next-step-pill";

/**
 * F40 — "Lagre til senere". Due punti (footer del drawer, stack step 3), una
 * sola definizione: ruolo 3 della tassonomia (secondario alleggerito, come
 * "Bygg et nytt design"), segnalibro outline nel cerchietto, MAI freccetta —
 * non fa avanzare il funnel — e MAI riempimento primario: l'unico dominante
 * resta "Send bestilling" (AC8).
 */
export function SaveForLaterPill({
  onClick,
  disabled = false,
  className,
  "data-testid": testId = "save-for-later",
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}) {
  // TODO:nb-review — "Lagre til senere" viene dal mockup cliente; le stringhe
  // di contorno (report, microcopy) sono traduzioni fresche.
  const t = useTranslations("cart");
  return (
    <NextStepPill
      variant="secondary"
      data-testid={testId}
      className={className}
      label={t("saved.cta")}
      disabled={disabled}
      onClick={onClick}
      icon={
        <PillIcon variant="secondary">
          <Bookmark className="size-5 text-primary/60" aria-hidden />
        </PillIcon>
      }
    />
  );
}
