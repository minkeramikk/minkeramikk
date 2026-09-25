/**
 * Terms/privacy live on the client's own marketing site, not this app —
 * TL ruling 25/9: every legal link opens minkeramikk.no in a new tab, this
 * app no longer renders the text itself. Single source so a URL change is
 * a one-line edit, not a grep-and-replace.
 */
export const LEGAL = {
  terms: "https://www.minkeramikk.no/kjopsvilkar",
  privacy: "https://www.minkeramikk.no/personopplysninger-og-cookies",
} as const;
