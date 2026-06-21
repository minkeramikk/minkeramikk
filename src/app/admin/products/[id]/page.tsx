import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import { ProductForm } from "@/components/admin/product-form";
import { createClient } from "@/lib/supabase/server";
import { mapAttributes } from "@/lib/catalog/product-attributes";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: product }, { data: suppliers }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name_no, name_en, description_no, description_en, price_cents, supplier_id, image, visible, sort_order, pieces, weight_g, product_attributes(label_no, label_en, value, sort_order)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("suppliers").select("id, name").order("name", { ascending: true }),
  ]);

  if (!product) notFound();

  return (
    <AdminShell
      active="/admin/products"
      title={product.name_no}
      action={
        <Link href="/admin/products" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ‹ All products
        </Link>
      }
    >
      <ProductForm
        suppliers={suppliers ?? []}
        product={{
          id: product.id,
          nameNo: product.name_no,
          nameEn: product.name_en,
          descriptionNo: product.description_no,
          descriptionEn: product.description_en,
          priceCents: product.price_cents,
          supplierId: product.supplier_id,
          image: product.image,
          visible: product.visible,
          sortOrder: product.sort_order,
          pieces: product.pieces,
          attributes: mapAttributes(product.product_attributes),
          weightG: product.weight_g,
        }}
      />
    </AdminShell>
  );
}
