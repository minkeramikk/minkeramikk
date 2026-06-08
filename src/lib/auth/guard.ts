/**
 * Pure routing decision for the /admin auth guard (F06) — unit-testable, no I/O.
 *
 * - anon on any /admin/* except the login page → send to /admin/login;
 * - authenticated on /admin/login → send to the dashboard;
 * - otherwise → no redirect (null).
 */
export function adminGuardRedirect(
  pathname: string,
  isAuthenticated: boolean
): "/admin/login" | "/admin" | null {
  const isLoginPage = pathname === "/admin/login";
  if (!isAuthenticated && !isLoginPage) return "/admin/login";
  if (isAuthenticated && isLoginPage) return "/admin";
  return null;
}
