import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/site/locale-switcher";
import { CartMenu } from "@/components/site/cart-menu";
import { PublicMobileNav } from "@/components/site/public-mobile-nav";

/** Public ink header (DESIGN-SYSTEM §3.7): brand left, nav + locale right. */
export function SiteHeader() {
  const t = useTranslations();

  return (
    // R2-6 C (enabler): sticky on mobile so the cart badge — and its "added"
    // pulse — stays in view while scrolling the long step-3 product list. z-40
    // sits above page content but below Radix overlays (z-50), so the cart
    // drawer still layers correctly. Desktop chrome unchanged.
    <header className="bg-ink text-ink-foreground max-md:sticky max-md:top-0 z-40">
      <div className="mx-auto flex h-14 max-w-[1060px] items-center justify-between px-5">
        <Link href="/" aria-label={t("common.siteName")} className="flex items-center">
          {/* white logo on the ink header — SVG scales crisply; height tuned to
              the 56px bar. Falls back to alt text if the asset is missing. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset in /public */}
          <img
            src="/logo.svg"
            alt={t("common.siteName")}
            width={137}
            height={36}
            className="h-9 w-auto"
          />
        </Link>
        <nav className="flex items-center gap-3 text-sm sm:gap-5">
          <PublicMobileNav />
          {/* Text links are desktop-only: the mobile baseline
              (docs/theme/preview-frontoffice-mobile.png) shows brand + locale
              switcher; the hamburger menu is tracked for F12. */}
          <Link
            href="/configurator"
            className="hidden text-ink-muted transition-colors hover:text-white sm:inline"
          >
            {t("nav.configurator")}
          </Link>
          <LocaleSwitcher />
          <CartMenu />
        </nav>
      </div>
    </header>
  );
}
