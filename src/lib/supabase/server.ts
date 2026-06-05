import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createBareClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Server client (server components, route handlers, server actions).
 * Uses the anon key: every query goes through RLS with the
 * authenticated user's session read from cookies.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component: session refresh is
            // handled by the middleware, safe to ignore.
          }
        },
      },
    }
  );
}

/**
 * Service-role client — BYPASSES RLS. Server-only by import guard.
 * Use exclusively in trusted code paths (import scripts, admin route
 * handlers). Never expose data from here without explicit checks.
 */
export function createServiceRoleClient() {
  return createBareClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
