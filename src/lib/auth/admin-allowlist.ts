/**
 * Defense-in-depth for the back-office (F06 hardening).
 *
 * A valid Supabase session is necessary but NOT sufficient to be an admin: the
 * user's email must also be on ADMIN_ALLOWLIST. This makes admin access
 * independent of the Supabase "disable signups" toggle — if signups are ever
 * re-enabled, an OAuth provider is added, or a stray user is created, they can
 * authenticate but still can't reach /admin.
 *
 * ADMIN_ALLOWLIST = comma-separated emails (case-insensitive). UNSET/empty →
 * NO restriction (any authenticated user — the pre-hardening behaviour), so a
 * missing env can never lock the admin out. Set it in production to activate:
 *   ADMIN_ALLOWLIST=tech@minkeramikk.no
 */
export function isAllowedAdmin(email: string | null | undefined): boolean {
  const list = (process.env.ADMIN_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return true; // allowlist not configured → no restriction
  return !!email && list.includes(email.toLowerCase());
}
