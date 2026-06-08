import Link from "next/link";
import { AdminShell } from "@/components/shell/admin-shell";
import { ProductForm } from "@/components/admin/product-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const supabase = await createClient();
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("active", true)
    .order("name", { ascending: true });

  return (
    <AdminShell
      active="/admin/products"
      title="New product"
      action={
        <Link href="/admin/products" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ‹ All products
        </Link>
      }
    >
      <ProductForm suppliers={suppliers ?? []} />
    </AdminShell>
  );
}
