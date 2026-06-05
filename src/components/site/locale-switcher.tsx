"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("localeSwitcher");

  return (
    <div
      aria-label={t("label")}
      className="flex items-center gap-1 text-xs font-medium"
    >
      {routing.locales.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 && <span className="text-ink-muted/60">/</span>}
          <Link
            href={pathname}
            locale={l}
            className={cn(
              "rounded px-1.5 py-1 uppercase transition-colors",
              l === locale
                ? "text-white underline underline-offset-4"
                : "text-ink-muted hover:text-white"
            )}
          >
            {t(l)}
          </Link>
        </span>
      ))}
    </div>
  );
}
