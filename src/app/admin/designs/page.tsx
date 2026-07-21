import Link from "next/link";
import { AdminShell } from "@/components/shell/admin-shell";
import { DesignOrderList, type DesignRow } from "@/components/admin/design-order-list";
import { createClient } from "@/lib/supabase/server";

// Live data: a new/edited design (and its active flag) is reflected at once.
export const dynamic = "force-dynamic";

export default async function AdminDesignsPage() {
  const supabase = await createClient();
  const { data: designs } = await supabase
    .from("designs")
    .select("id, name, name_no, name_en, code, active, sort_order, suppliers(name), option_categories(id)")
    .order("sort_order", { ascending: true });

  // Shaped here so the client list gets plain rows (and a stable array to sync on).
  const rows: DesignRow[] = (designs ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    nameNo: d.name_no ?? d.name,
    nameEn: d.name_en ?? d.name,
    supplierName: (d.suppliers as { name: string } | null)?.name ?? "—",
    code: d.code,
    categories: (d.option_categories as { id: string }[] | null)?.length ?? 0,
    active: d.active,
  }));

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
          <DesignOrderList designs={rows} />
        )}
      </div>
    </AdminShell>
  );
}
