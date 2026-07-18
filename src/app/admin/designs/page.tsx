import Link from "next/link";
import { AdminShell } from "@/components/shell/admin-shell";
import { DuplicateDesignButton } from "@/components/admin/duplicate-design-button";
import { createClient } from "@/lib/supabase/server";

// Live data: a new/edited design (and its active flag) is reflected at once.
export const dynamic = "force-dynamic";

export default async function AdminDesignsPage() {
  const supabase = await createClient();
  const { data: designs } = await supabase
    .from("designs")
    .select("id, name, name_no, name_en, code, active, sort_order, suppliers(name), option_categories(id)")
    .order("sort_order", { ascending: true });

  const rows = designs ?? [];

  return (
    <AdminShell
      active="/admin/designs"
      title="Configurator designs"
      action={
        <Link
          href="/admin/designs/new"
          data-testid="new-design"
          className="h-9 rounded-lg bg-primary px-3 text-sm font-medium leading-9 text-primary-foreground"
        >
          New design
        </Link>
      }
    >
      <div data-testid="admin-designs">
        {rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            No designs yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Supplier</th>
                  <th className="px-4 py-2.5 font-medium">Code</th>
                  <th className="px-4 py-2.5 font-medium">Categories</th>
                  <th className="px-4 py-2.5 font-medium">Active</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const supplierName =
                    (d.suppliers as { name: string } | null)?.name ?? "—";
                  const catCount = (d.option_categories as { id: string }[] | null)?.length ?? 0;
                  return (
                    <tr
                      key={d.id}
                      data-testid="design-row"
                      className="border-b border-border/50 last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-4 py-3 font-medium">{d.name}</td>
                      <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                        {supplierName}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{d.code ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums">{catCount}</td>
                      <td className="px-4 py-3">
                        <span data-status={d.active ? "active" : "draft"}>
                          {d.active ? "Yes" : "Draft"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <DuplicateDesignButton
                            designId={d.id}
                            designNameNo={d.name_no ?? d.name}
                            designNameEn={d.name_en ?? d.name}
                          />
                          <Link
                            href={`/admin/designs/${d.id}`}
                            data-testid="design-edit"
                            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                          >
                            Edit
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
