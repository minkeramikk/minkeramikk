import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import { SupplierForm } from "@/components/admin/supplier-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, name, email, phone, notes, active")
    .eq("id", id)
    .maybeSingle();

  if (!supplier) notFound();

  return (
    <AdminShell
      active="/admin/suppliers"
      title={supplier.name}
      action={
        <Link href="/admin/suppliers" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ‹ All suppliers
        </Link>
      }
    >
      <SupplierForm supplier={supplier} />
    </AdminShell>
  );
}
