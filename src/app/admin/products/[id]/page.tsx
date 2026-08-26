import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import { ProductForm } from "@/components/admin/product-form";
import { PhotosEditor } from "@/components/admin/photos-editor";
import { createClient } from "@/lib/supabase/server";
import { mapTypedAttributes } from "@/lib/catalog/product-attributes";
import { MAX_PRODUCT_PHOTOS } from "@/lib/catalog/product-photos";
import { distinctSeries } from "@/lib/catalog/series-options";
import {
  uploadProductPhoto,
  reorderProductPhoto,
  deleteProductPhoto,
} from "@/app/admin/products/photo-actions";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: product }, { data: suppliers }, { data: photos }, { data: seriesRows }] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "id, name_no, name_en, description_no, description_en, series_no, series_en, price_cents, supplier_id, image, visible, sort_order, pieces, slug, product_attributes(key, label_no, label_en, value, value_num, sort_order)"
        )
        .eq("id", id)
        .maybeSingle(),
      supabase.from("suppliers").select("id, name").order("name", { ascending: true }),
      supabase
        .from("product_images")
        .select("id, image")
        .eq("product_id", id)
        .order("sort_order", { ascending: true }),
      supabase.from("products").select("series_no, series_en"),
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
      <div className="flex flex-col gap-8">
        <ProductForm
          suppliers={suppliers ?? []}
          seriesOptions={distinctSeries(seriesRows)}
          product={{
            id: product.id,
            nameNo: product.name_no,
            nameEn: product.name_en,
            descriptionNo: product.description_no,
            descriptionEn: product.description_en,
            seriesNo: product.series_no,
            seriesEn: product.series_en,
            priceCents: product.price_cents,
            supplierId: product.supplier_id,
            image: product.image,
            visible: product.visible,
            sortOrder: product.sort_order,
            pieces: product.pieces,
            attributes: mapTypedAttributes(product.product_attributes),
          }}
        />

        <section className="max-w-lg">
          <h2 className="mb-3 text-base font-semibold">Photos</h2>
          <PhotosEditor
            ownerId={product.id}
            slug={product.slug}
            photos={photos ?? []}
            max={MAX_PRODUCT_PHOTOS}
            testIdPrefix="product-photo"
            hint="Up to 2 photos of this ceramic, shown in the step-3 product dialog. PNG/JPG/WebP, up to 4 MB each."
            upload={uploadProductPhoto}
            reorder={reorderProductPhoto}
            remove={deleteProductPhoto}
          />
        </section>
      </div>
    </AdminShell>
  );
}
