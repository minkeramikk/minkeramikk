import Link from "next/link";
import { AdminShell } from "@/components/shell/admin-shell";
import { createClient } from "@/lib/supabase/server";

// Live data: a new/edited supplier shows immediately.
export const dynamic = "force-dynamic";

export default async function AdminSuppliersPage() {
  const supabase = await createClient();
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, email, phone, active")
    .order("name", { ascending: true });

  const rows = suppliers ?? [];

  return (
    <AdminShell
      active="/admin/suppliers"
      title="Suppliers"
      action={
        <Link
          href="/admin/suppliers/new"
          data-testid="new-supplier"
          className="h-9 rounded-lg bg-primary px-3 text-sm font-medium leading-9 text-primary-foreground"
        >
          New supplier
        </Link>
      }
    >
      <div data-testid="admin-suppliers">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No suppliers yet.
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Email</th>
                    <th className="px-4 py-2.5 font-medium">Phone</th>
                    <th className="px-4 py-2.5 font-medium">Active</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr
                      key={s.id}
                      data-testid="supplier-row"
                      className="border-b border-border/50 last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.email ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.phone ?? "—"}</td>
                      <td className="px-4 py-3">{s.active ? "Yes" : "No"}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/suppliers/${s.id}`}
                          data-testid="supplier-edit"
                          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 md:hidden">
              {rows.map((s) => (
                <Link
                  key={s.id}
                  href={`/admin/suppliers/${s.id}`}
                  data-testid="supplier-card"
                  className="block rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{s.email ?? "—"}</div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
