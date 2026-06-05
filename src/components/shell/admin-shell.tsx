import Link from "next/link";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/suppliers", label: "Suppliers" },
  { href: "/admin/assets", label: "Configurator assets" },
  { href: "/admin/theme", label: "Theme" },
] as const;

/**
 * Back-office shell (DESIGN-SYSTEM §3.6/§4): ink sidebar + topbar.
 * English-only (i18n rule 5). Auth guard arrives with F06.
 */
export function AdminShell({
  children,
  active,
  title,
  action,
}: {
  children: React.ReactNode;
  active: (typeof NAV)[number]["href"];
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
          {NAV.map((item) => (
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
      <main className="max-w-[1040px] flex-1 px-8 py-7">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-[22px]">{title}</h1>
          {action}
        </div>
        {children}
      </main>
    </div>
  );
}
