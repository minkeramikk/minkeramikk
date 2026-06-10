import { notFound } from "next/navigation";

/**
 * Catch-all under /[locale] (next-intl pattern). Without it, Next renders its
 * bare default 404 for unknown in-locale paths because they never reach the
 * [locale] layout. This page matches any otherwise-unmatched path and triggers
 * notFound(), so the branded [locale]/not-found.tsx renders inside the locale
 * layout (NextIntlClientProvider + theme). Real routes still win over [...rest].
 */
export default function CatchAllNotFound() {
  notFound();
}
