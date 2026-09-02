import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { getMessages } from "./overrides.server";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    // R4-I18N (ADR 0026): files + the back-office overrides on top. On any
    // failure — no override, no table, no database — this is the files, and
    // the site is what it is today.
    messages: await getMessages(locale),
  };
});
