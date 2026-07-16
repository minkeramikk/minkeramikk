import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import { SupplierForm } from "@/components/admin/supplier-form";
import {
  GlazeColoursEditor,
  type GlazeColour,
} from "@/components/admin/glaze-colours-editor";
import { createClient } from "@/lib/supabase/server";
import { assetUrl } from "@/lib/storage";

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

  // Glaze palette (F35): colours + how many designs use each (safety before removal).
  const { data: colourRows } = await supabase
    .from("supplier_colors")
    .select("id, hex, name, active, swatch_image, sort_order")
    .eq("supplier_id", id)
    .order("sort_order", { ascending: true });

  const paletteIds = (colourRows ?? []).map((c) => c.id);
  const usedByDesigns = new Map<string, number>();
  if (paletteIds.length > 0) {
    const { data: usageRows } = await supabase
      .from("options")
      .select("supplier_color_id, option_categories(design_id)")
      .in("supplier_color_id", paletteIds);
    const perColour = new Map<string, Set<string>>();
    for (const u of (usageRows ?? []) as {
      supplier_color_id: string | null;
      option_categories: { design_id: string } | null;
    }[]) {
      if (!u.supplier_color_id || !u.option_categories) continue;
      if (!perColour.has(u.supplier_color_id)) perColour.set(u.supplier_color_id, new Set());
      perColour.get(u.supplier_color_id)!.add(u.option_categories.design_id);
    }
    for (const [cid, designs] of perColour) usedByDesigns.set(cid, designs.size);
  }

  const colours: GlazeColour[] = (colourRows ?? []).map((c) => ({
    id: c.id,
    hex: c.hex,
    name: c.name,
    active: c.active,
    swatchImage: c.swatch_image,
    swatchUrl: c.swatch_image ? assetUrl(c.swatch_image) : null,
    usedByDesigns: usedByDesigns.get(c.id) ?? 0,
  }));

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
      <GlazeColoursEditor supplierId={supplier.id} colours={colours} />
    </AdminShell>
  );
}
