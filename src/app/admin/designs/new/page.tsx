import Link from "next/link";
import { AdminShell } from "@/components/shell/admin-shell";
import { DesignForm } from "@/components/admin/design-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewDesignPage() {
  const supabase = await createClient();
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("active", true)
    .order("name", { ascending: true });

  return (
    <AdminShell
      active="/admin/designs"
      title="New design"
      action={
        <Link href="/admin/designs" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ‹ All designs
        </Link>
      }
    >
      <p className="mb-4 max-w-lg text-sm text-muted-foreground">
        Create the design first; then add its categories and review the composed
        preview before activating it.
      </p>
      <DesignForm suppliers={suppliers ?? []} />
    </AdminShell>
  );
}
