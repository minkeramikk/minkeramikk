import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/admin/actions";
import { ADMIN_NAV, type AdminNavHref } from "./admin-nav";
import { AdminMobileNav } from "./admin-mobile-nav";

/**
 * Back-office shell (DESIGN-SYSTEM §3.6/§4): ink sidebar + topbar with logout.
 * English-only (i18n rule 5). All /admin/* pages are guarded by the auth
 * middleware (F06); pages compose this shell with their own title.
 */
export function AdminShell({
  children,
  active,
  title,
  action,
}: {
  children: React.ReactNode;
  active: AdminNavHref;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-[210px] shrink-0 bg-ink py-6 text-ink-foreground md:block">
        <span className="mb-7 block px-6 font-heading text-[17px] font-semibold tracking-[0.02em] text-white">
          minkeramikk
        </span>
        <nav>
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block border-l-[3px] py-2.5 px-6 text-[13.5px] transition-colors",
                item.href === active
                  ? "border-primary bg-white/5 text-white"
                  : "border-transparent text-ink-muted hover:text-white",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="max-w-[1040px] flex-1 px-6 py-7 md:px-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <AdminMobileNav active={active} />
            <h1 className="truncate text-[22px]">{title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {action}
            <form action={logout}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                data-testid="logout"
              >
                Log out
              </Button>
            </form>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
