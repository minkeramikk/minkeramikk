import "server-only";

import { createClient as createBareClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Service-role client — BYPASSES RLS. Trusted server paths only (import
 * scripts, order API). Kept free of `next/headers` so server-side modules that
 * only need privileged writes don't pull the request-scoped cookie client.
 */
export function createServiceRoleClient() {
  return createBareClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
