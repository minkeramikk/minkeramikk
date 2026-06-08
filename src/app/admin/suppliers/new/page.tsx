import Link from "next/link";
import { AdminShell } from "@/components/shell/admin-shell";
import { SupplierForm } from "@/components/admin/supplier-form";

export default function NewSupplierPage() {
  return (
    <AdminShell
      active="/admin/suppliers"
      title="New supplier"
      action={
        <Link href="/admin/suppliers" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ‹ All suppliers
        </Link>
      }
    >
      <SupplierForm />
    </AdminShell>
  );
}
