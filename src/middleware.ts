import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // tutto tranne /api, /admin, asset interni e file statici
  matcher: ["/((?!api|admin|_next|_vercel|.*\\..*).*)"],
};
