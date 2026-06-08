import { createClient as createBareClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Session-less ANON client for PUBLIC catalog reads (designs/options/products).
 *
 * Unlike the cookie-session server client, this never reads or refreshes an auth
 * token. That matters because the public configurator is browsable while an
 * admin session cookie is present (same browser): with the cookie client, every
 * public read would try to refresh an expiring admin JWT and hammer the Supabase
 * auth endpoint (HTTP 429 over_request_rate_limit). The catalog is anon-readable
 * via RLS, so no session is needed here.
 *
 * `autoRefreshToken: false` + `persistSession: false`: pure anon, zero auth calls.
 */
export function createPublicClient() {
  return createBareClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
