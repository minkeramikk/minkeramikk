"use client";

import type { ReactNode } from "react";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LegalArticle } from "@/components/site/legal-article";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * §3.34 LegalSheet (new — DS section proposed in this PR, TL feedback 25/9):
 * terms/privacy open in a closable side panel instead of navigating away, so
 * the cart and the order form never unmount underneath (Turnstile keeps its
 * token). ONE Radix `Sheet` for every breakpoint (§3.19's own rule against
 * swapping components by media query), reading the SAME `legal.*` copy
 * `/terms` and `/privacy` already render via `LegalArticle` — never retyped.
 * `showCloseButton={false}` + our own `SheetClose`: the shared default close
 * button carries no test id, and this one needs `legal-sheet-close`.
 */
export function LegalSheet({
  doc,
  children,
}: {
  doc: "terms" | "privacy";
  /** The trigger — rendered as-is via Radix `asChild` (keeps the caller's own button/styling). */
  children: ReactNode;
}) {
  const t = useTranslations(`legal.${doc}`);
  const tInsurance = useTranslations("cart.insurance");
  const tLegal = useTranslations("legal");
  const href = doc === "terms" ? "/terms" : "/privacy";
  // R3-B4: same append the /terms route makes — never re-typed into legal.terms.body.
  const body = doc === "terms" ? `${t("body")}\n\n${tInsurance("policyTerms")}` : t("body");

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton={false}
        data-testid="legal-sheet"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md"
      >
        {/* Radix requires a title for a11y; `LegalArticle` already renders the
            same text as its visible <h1>, so this one stays screen-reader-only. */}
        <SheetTitle className="sr-only">{t("title")}</SheetTitle>
        <SheetClose asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="legal-sheet-close"
            className="absolute top-3 right-3 z-10"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        </SheetClose>
        <LegalArticle title={t("title")} body={body} />
        <Link
          href={href}
          className="mx-6 mb-8 block text-sm underline underline-offset-2 hover:text-foreground"
        >
          {tLegal("openAsPage")}
        </Link>
      </SheetContent>
    </Sheet>
  );
}
