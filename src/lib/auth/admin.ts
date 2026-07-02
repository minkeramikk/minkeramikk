import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isAllowedAdmin } from "./admin-allowlist";

/**
 * The authenticated admin (F06), or null. Reads the session from cookies via the
 * anon-key server client (RLS applies). Pages are already guarded by middleware;
 * admin route handlers (F07+) call this and return 401 when it is null.
 *
 * Defense-in-depth: a valid session only counts if the user is on the
 * ADMIN_ALLOWLIST (see admin-allowlist.ts) — any other authenticated user is
 * treated as not-admin (null).
 */
export async function getAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && !isAllowedAdmin(user.email)) return null;
  return user;
}
