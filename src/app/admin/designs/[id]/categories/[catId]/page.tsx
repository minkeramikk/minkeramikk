import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import { OptionEditor, type OptionValues } from "@/components/admin/option-editor";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CategoryOptionsPage({
  params,
}: {
  params: Promise<{ id: string; catId: string }>;
}) {
  const { id, catId } = await params;
  const supabase = await createClient();

  const { data: category } = await supabase
    .from("option_categories")
    .select("id, label_en, kind, design_id, designs(name)")
    .eq("id", catId)
    .maybeSingle();
  if (!category || category.design_id !== id) notFound();

  const { data: options } = await supabase
    .from("options")
    .select("id, name, hex, image, layer_image, sort_order, active, code")
    .eq("category_id", catId)
    .order("sort_order", { ascending: true });

  const designName = (category.designs as { name: string } | null)?.name ?? "Design";
  const values: OptionValues[] = (options ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    hex: o.hex,
    image: o.image,
    layerImage: o.layer_image,
    sortOrder: o.sort_order ?? 0,
    active: o.active,
  }));

  return (
    <AdminShell
      active="/admin/designs"
      title={`${designName} › ${category.label_en} options`}
      action={
        <Link href={`/admin/designs/${id}`} className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ‹ Back to design
        </Link>
      }
    >
      <p className="mb-3 max-w-2xl text-sm text-muted-foreground">
        {category.kind === "color"
          ? "Colour options carry a hex (and optionally a real swatch image + a compositing layer)."
          : "Image options carry an asset (swatch) and optionally a compositing layer."}{" "}
        Each option gets a stable code automatically. Duplicate hex or name within
        this category is rejected.
      </p>
      <OptionEditor designId={id} categoryId={catId} options={values} />
    </AdminShell>
  );
}
