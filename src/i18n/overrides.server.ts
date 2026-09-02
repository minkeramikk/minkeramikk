import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { isEditableKey, mergeOverrides, type MessageOverrides } from "./overrides";
import type { Locale } from "./routing";

/**
 * R4-I18N — the text overrides written from the back office (ADR 0026).
 *
 * Twin of `src/lib/theme.server.ts`: the row is public-readable (RLS 0039), so
 * this uses the session-less ANON client — no per-pageview JWT refresh
 * (PERF-1 / P-5) — and it is cached under the `i18n` tag, which the save
 * action (Task 5) revalidates.
 *
 * It never throws. Whatever goes wrong — the table not created yet (the PM
 * applies 0039, so there is a window where this code is live and the migration
 * is not; PostgREST reports that as either 42P01 or its own PGRST205), the
 * database silent, a malformed row — the caller gets `{}` and the site serves
 * the files, exactly as it does today (AC3).
 */
async function loadOverrides(locale: string): Promise<MessageOverrides> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("i18n_overrides")
      .select("key, value")
      .eq("locale", locale);
    if (error || !data) return {};
    return Object.fromEntries(
      data
        .filter((row) => isEditableKey(row.key))
        .map((row) => [row.key, row.value])
    );
  } catch {
    return {};
  }
}

/** `unstable_cache` keys on the arguments too, so this caches per locale. */
export const getMessageOverrides = unstable_cache(
  loadOverrides,
  ["i18n-overrides"],
  { tags: ["i18n"] }
);

/**
 * `unstable_cache` THROWS outside a request scope (R4-MAIL-JOURNEY §E). Every
 * next-intl read in this project happens inside a `[locale]` render — verified
 * by grep over `getTranslations`/`useTranslations` — so this catch is the AC3
 * belt and not a path we expect to walk. Unlike `getThemeTokensSafe` it does
 * NOT retry uncached: the fallback here is the shipped copy in the repo, which
 * is correct copy, not a wrong purple.
 */
export async function getMessageOverridesSafe(
  locale: string
): Promise<MessageOverrides> {
  try {
    return await getMessageOverrides(locale);
  } catch {
    return {};
  }
}

/**
 * THE one place where the public messages are composed: files from the repo,
 * overrides from the database on top. `src/i18n/request.ts` calls this and
 * nothing else does — a second composition point would be a bug, not a feature.
 */
export async function getMessages(locale: Locale) {
  const base = (await import(`./messages/${locale}.json`)).default;
  return mergeOverrides(base, await getMessageOverridesSafe(locale));
}
