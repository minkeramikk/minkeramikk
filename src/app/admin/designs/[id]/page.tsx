import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import { DesignForm } from "@/components/admin/design-form";
import { DesignTree, type CategorySlot, type OptionSlot } from "@/components/admin/design-tree";
import { DeleteDesignButton } from "@/components/admin/delete-design-button";
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
  const catIds = cats.map((c) => c.id);

  // ── fetch ALL options for the tree (F22) + first-per-cat for preview ────────
  const allOptionsRows =
    catIds.length > 0
      ? ((
          await supabase
            .from("options")
            .select("id, category_id, name, hex, image, layer_image, code, sort_order, active, is_default")
            .in("category_id", catIds)
            .order("sort_order", { ascending: true })
        ).data ?? [])
      : [];

  // R2-1a: preview the DEFAULT option's layer per category (matches the live
  // step-1 cover). allOptionsRows is ordered by sort_order, so the first row we
  // see per category is the sort_order fallback; an is_default row overrides it.
  const coverByCat = new Map<string, string | null>();
  for (const o of allOptionsRows) {
    if (!coverByCat.has(o.category_id)) coverByCat.set(o.category_id, o.layer_image);
    if (o.is_default) coverByCat.set(o.category_id, o.layer_image);
  }
  const selected: SelectedCategory[] = cats.map((c) => ({
    layerSlot: (c.layer_slot ?? "base") as LayerSlot,
    layerImage: coverByCat.get(c.id) ?? null,
  }));
  const previewLayers = getPreviewLayers(null, selected).map((l) => ({
    src: assetUrl(l.src),
    recolor: l.blend === "multiply",
  }));

  // ── build CategorySlot[] for DesignTree ──────────────────────────────────────
  const optionsByCat = new Map<string, OptionSlot[]>();
  for (const o of allOptionsRows) {
    const slot: OptionSlot = {
      id: o.id,
      name: o.name,
      hex: o.hex,
      image: o.image,
      layerImage: o.layer_image,
      code: o.code,
      sortOrder: o.sort_order ?? 0,
      active: o.active,
      isDefault: o.is_default,
    };
    if (!optionsByCat.has(o.category_id)) optionsByCat.set(o.category_id, []);
    optionsByCat.get(o.category_id)!.push(slot);
  }

  const categorySlots: CategorySlot[] = cats.map((c) => ({
    id: c.id,
    labelNo: c.label_no ?? "",
    labelEn: c.label_en ?? "",
    kind: (c.kind as "color" | "image") ?? "color",
    layerSlot: c.layer_slot ?? "base",
    syncGroup: c.sync_group,
    sortOrder: c.sort_order ?? 0,
    options: optionsByCat.get(c.id) ?? [],
  }));

  return (
    <AdminShell
      active="/admin/designs"
      title={design.name}
      action={
        <Link
          href="/admin/designs"
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          ‹ All designs
        </Link>
      }
    >
      <div
        className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]"
        data-testid="design-detail"
        data-active={design.active}
      >
        <div className="flex flex-col gap-8">
          {/* Design metadata form */}
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

          {/* F22: accordion tree replaces flat CategoryEditor */}
          <section>
            <h2 className="mb-1 text-base font-semibold">Categories &amp; options</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Expand a category to see and manage its options inline. Deleting a
              category removes all its options too.{" "}
              <span className="text-foreground">
                The live preview composes once each category&rsquo;s first option
                has a compositing layer
              </span>{" "}
              — options without one are tagged &ldquo;no layer&rdquo;; open{" "}
              <em>Edit</em> on an option to upload it.
            </p>
            <DesignTree designId={design.id} categories={categorySlots} />
          </section>

          {/* Danger zone */}
          <section>
            <DeleteDesignButton designId={design.id} designName={design.name} />
          </section>
        </div>

        {/* sticky preview sidebar */}
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
            Composed from each category&rsquo;s first option (multiply). Review
            it, then tick <em>Active</em> above and save to publish.
          </p>
        </aside>
      </div>
    </AdminShell>
  );
}
