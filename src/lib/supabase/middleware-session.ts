import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { adminGuardRedirect } from "@/lib/auth/guard";
import type { Database } from "./types";

/**
 * Auth guard + session refresh for ALL /admin/* requests (F06).
 *
 * - refreshes the Supabase session cookie (so it persists across navigations);
 * - not authenticated on any /admin/* (except the login page) → redirect to
 *   /admin/login (no admin content is ever served to anon);
 * - authenticated on /admin/login → redirect to the dashboard.
 *
 * Anon key only: this never elevates privileges. The service-role key is never
 * used here (or anywhere reachable from the client).
 */
export async function updateAdminSession(
  request: NextRequest
): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: nothing between client creation and getUser() (Supabase SSR rule).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const target = adminGuardRedirect(request.nextUrl.pathname, !!user);
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
