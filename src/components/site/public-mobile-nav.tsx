"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LocaleSwitcher } from "@/components/site/locale-switcher";

/**
 * Public mobile menu (F12). The header's text nav is desktop-only (≥sm); below
 * that this hamburger opens an ink drawer (shadcn Sheet = Radix Dialog → focus
 * trap, Esc, focus restore for free) with the nav links + the locale switch.
 */
export function PublicMobileNav() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/products", label: t("nav.products") },
    { href: "/configurator", label: t("nav.configurator") },
    { href: "/terms", label: t("footer.terms") },
    { href: "/privacy", label: t("footer.privacy") },
  ] as const;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={t("nav.menu")}
          aria-haspopup="dialog"
          data-testid="mobile-menu"
          className="flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:hidden"
        >
          <Menu className="size-5" aria-hidden />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        data-testid="mobile-menu-drawer"
        className="w-64 border-0 bg-ink p-0 text-ink-foreground"
      >
        <SheetHeader className="p-6 pb-2">
          <SheetTitle className="font-heading text-[17px] text-white">
            {t("common.siteName")}
          </SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              data-testid={`mobile-nav-${l.href.replace("/", "")}`}
              className="px-6 py-2.5 text-[14px] text-ink-muted transition-colors hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 px-6">
          <LocaleSwitcher />
        </div>
      </SheetContent>
    </Sheet>
  );
}
