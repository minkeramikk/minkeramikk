"use client";

import { useTranslations } from "next-intl";
import { Lightbulb } from "lucide-react";
import { usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useCartContext } from "@/lib/cart/cart-context";
import { unpaintedPieces } from "@/lib/cart/cart";
import { useTour } from "@/lib/tour/use-tour";
import { sequenceForContext } from "@/lib/tour/tour";

/**
 * R5-TUTORIAL round 2 (plan Task E) — the header's own replay: wherever the
 * customer is on `/configurator`, one click restarts THAT spot's tip, even
 * if tips were turned off for good (`tour.start` always sets `off: false`).
 * `kitMode`/`step` read exactly the way `cart-menu.tsx:65` already does —
 * same `useSearchParams()` pattern, no second way of asking the same
 * question. `sequenceForContext` (tour.ts, Task A) is the one place that
 * turns those two into a sequence; this button doesn't re-derive the rule.
 *
 * TODO:nb-review — tour.replay NO copy is new, unreviewed.
 */
export function TourReplayButton() {
  const t = useTranslations("tour");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { cart, hydrated } = useCartContext();
  const tour = useTour();

  if (pathname !== "/configurator") return null;

  const unpainted = hydrated ? unpaintedPieces(cart) : 0;
  const kitMode = searchParams.get("origin") === "kit" && (!hydrated || unpainted > 0);
  const step = searchParams.get("step") === "3" ? 3 : searchParams.get("step") === "2" ? 2 : 1;

  return (
    <button
      type="button"
      data-testid="tour-replay"
      aria-label={t("replay")}
      title={t("replay")}
      onClick={() => tour.start(sequenceForContext(kitMode, step))}
      className="flex size-11 items-center justify-center rounded-lg text-ink-muted transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <Lightbulb className="size-5" aria-hidden />
    </button>
  );
}
