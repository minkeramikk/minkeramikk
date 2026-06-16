/**
 * Absolute site origin for links that leave the app (emails, share URLs).
 * In the browser/relative contexts we use next-intl <Link>; only outbound
 * channels need the full origin. `NEXT_PUBLIC_SITE_URL` overrides; the default
 * is the production domain (verified by the INFRA card before go-live).
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://minkeramikk.no").replace(
    /\/$/,
    ""
  );
}
