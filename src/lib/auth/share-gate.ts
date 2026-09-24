/**
 * R5-KIT — who may press Share. A valid session is necessary but NOT
 * sufficient: the email must be on ADMIN_ALLOWLIST. Pure apart from the
 * allowlist read, so the negative case is unit-testable.
 */
import { isAllowedAdmin } from "./admin-allowlist";

export function shareAllowed(user: { email?: string | null } | null): boolean {
  return !!user && isAllowedAdmin(user.email);
}
