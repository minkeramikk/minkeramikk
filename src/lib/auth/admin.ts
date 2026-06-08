import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * The authenticated admin (F06), or null. Reads the session from cookies via the
 * anon-key server client (RLS applies). Pages are already guarded by middleware;
 * admin route handlers (F07+) call this and return 401 when it is null.
 */
export async function getAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
