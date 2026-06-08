import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import { DesignForm } from "@/components/admin/design-form";
import { CategoryEditor, type CategoryValues } from "@/components/admin/category-editor";
import { PreviewCanvas } from "@/components/ui-domain/preview-canvas";
import { createClient } from "@/lib/supabase/server";
import { assetUrl } from "@/lib/storage";
import {
  getPreviewLayers,
  type LayerSlot,
  type SelectedCategory,
} from "@/lib/configurator/preview";

export const dynamic = "force-dynamic";

export default async function EditDesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: design }, { data: suppliers }] = await Promise.all([
    supabase
      .from("designs")
      .select(
        "id, name, description_no, description_en, supplier_id, preview_image, sort_order, active, code, option_categories(id, label_no, label_en, kind, layer_slot, sync_group, sort_order)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("suppliers").select("id, name").eq("active", true).order("name"),
  ]);

  if (!design) notFound();

  const cats = (design.option_categories ?? []).slice().sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  // default preview: each category's first option (by sort_order) layer_image,
  // composed exactly like the public configurator (multiply / animal on top).
  const catIds = cats.map((c) => c.id);
  let selected: SelectedCategory[] = [];
  if (catIds.length > 0) {
    const { data: opts } = await supabase
      .from("options")
      .select("category_id, layer_image, sort_order")
      .in("category_id", catIds)
      .order("sort_order", { ascending: true });
    const firstByCat = new Map<string, string | null>();
    for (const o of opts ?? []) {
      if (!firstByCat.has(o.category_id)) firstByCat.set(o.category_id, o.layer_image);
    }
    selected = cats.map((c) => ({
      layerSlot: (c.layer_slot ?? "base") as LayerSlot,
      layerImage: firstByCat.get(c.id) ?? null,
    }));
  }
  const previewLayers = getPreviewLayers(null, selected).map((l) => ({
    src: assetUrl(l.src),
    recolor: l.blend === "multiply",
  }));

  const categoryValues: CategoryValues[] = cats.map((c) => ({
    id: c.id,
    labelNo: c.label_no ?? "",
    labelEn: c.label_en ?? "",
    kind: (c.kind as "color" | "image") ?? "color",
    layerSlot: c.layer_slot ?? "base",
    syncGroup: c.sync_group,
    sortOrder: c.sort_order ?? 0,
  }));

  return (
    <AdminShell
      active="/admin/designs"
      title={design.name}
      action={
        <Link href="/admin/designs" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ‹ All designs
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]" data-testid="design-detail" data-active={design.active}>
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="mb-3 text-base font-semibold">Design</h2>
            <DesignForm
              suppliers={suppliers ?? []}
              design={{
                id: design.id,
                name: design.name,
                descriptionNo: design.description_no,
                descriptionEn: design.description_en,
                supplierId: design.supplier_id,
                previewImage: design.preview_image,
                sortOrder: design.sort_order,
                active: design.active,
                code: design.code,
              }}
            />
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold">Categories</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Options live inside each category (added in the asset step). Deleting
              a category removes its options too.
            </p>
            <CategoryEditor designId={design.id} categories={categoryValues} />
          </section>
        </div>

        {/* preview before publishing */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <h2 className="mb-3 text-base font-semibold">Preview</h2>
          <PreviewCanvas
            alt={design.name}
            layers={previewLayers}
            caption={
              design.active
                ? "Active — visible in the configurator."
                : "Draft — not shown in the configurator until you activate it."
            }
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Composed from each category&rsquo;s first option (multiply). Review it,
            then tick <em>Active</em> above and save to publish.
          </p>
        </aside>
      </div>
    </AdminShell>
  );
}
