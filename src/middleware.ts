import createMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { updateAdminSession } from "./lib/supabase/middleware-session";

const intlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  // /admin/* is English-only, outside [locale]: guard it with Supabase Auth
  // instead of next-intl (i18n rule 5). Everything else gets the intl routing.
  if (request.nextUrl.pathname.startsWith("/admin")) {
    return updateAdminSession(request);
  }
  return intlMiddleware(request);
}

export const config = {
  // everything except /api, internal assets and static files. /admin is now
  // INCLUDED (it needs the auth guard above); admin route handlers self-guard.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
