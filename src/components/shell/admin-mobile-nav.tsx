"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ADMIN_NAV, type AdminNavHref } from "./admin-nav";
import { logout } from "@/app/admin/actions";

/** Mobile drawer for the back-office (shadcn Sheet). Shown < md; the desktop
 *  sidebar lives in AdminShell. */
export function AdminMobileNav({ active }: { active: AdminNavHref }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          className="md:hidden"
          aria-label="Open menu"
          data-testid="admin-menu"
        >
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-64 border-0 bg-ink p-0 text-ink-foreground"
      >
        <SheetHeader className="p-6 pb-2">
          <SheetTitle className="font-heading text-[17px] text-white">
            minkeramikk
          </SheetTitle>
        </SheetHeader>
        <nav>
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
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
        <form action={logout} className="mt-4 px-6">
          <Button type="submit" variant="outline" size="sm" className="w-full">
            Log out
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
