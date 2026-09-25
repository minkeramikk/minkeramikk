import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { getDesignDetail } from "@/lib/catalog/design-options";
import {
  decodeConfigCode,
  toCodecDesign,
  ConfigCodeError,
} from "@/lib/configurator/config-code";
import { getPreviewLayers, type SelectedCategory } from "@/lib/configurator/preview";
import { composePlate, resizeProductPhoto, type ComposeLayer } from "./compose-plate";
import { buildLabPdfDoc } from "./lab-pdf-content";
import { LabPdfDocument, type LabPdfRenderItem } from "./lab-pdf";
import type { AdminOrder, AdminOrderItem } from "./admin-orders";

type Supa = Awaited<ReturnType<typeof createClient>>;

/** Resolve an item's ordered compositing layers (paths + blend) from its design
 *  + config code. Returns [] when it can't be resolved (→ degrade: no image). */
async function resolveItemLayers(
  item: AdminOrderItem
): Promise<{ src: string; blend: "normal" | "multiply" }[]> {
  const designSlug = item.configSnapshot?.designSlug;
  if (!designSlug || !item.configCode) return [];

  const detail = await getDesignDetail(designSlug);
  if (!detail) return [];
  const codec = toCodecDesign(detail);
  if (!codec) return [];

  let selections: Record<string, string> = {};
  try {
    ({ selections } = decodeConfigCode(item.configCode, (c) =>
      c.toUpperCase() === (detail.code ?? "").toUpperCase() ? codec : null
    ));
  } catch (e) {
    if (!(e instanceof ConfigCodeError)) throw e;
    return [];
  }

  const cats: SelectedCategory[] = detail.categories.map((cat) => {
    const optId = selections[cat.slug];
    const opt = cat.options.find((o) => o.id === optId) ?? cat.options[0];
    return { layerSlot: cat.layerSlot, layerImage: opt?.layerImage ?? null };
  });
  return getPreviewLayers(null, cats);
}

/**
 * R5-QA2 T3 — the workshop reads English regardless of the order's own locale:
 * enriches every item's product/design/option names from the LIVE catalogue
 * (`product_id` → `products.name_en`, already joined onto `productNameEn`;
 * `config_code` → live `DesignDetail` → `nameEn`/`labelEn`), falling back to
 * the frozen snapshot only when the live entity is gone (product or design
 * deleted) — never an empty line. `lab-pdf.tsx`/`lab-pdf-content.ts` stay pure
 * and unaware of any of this: they just read `productName`/`configSnapshot`
 * same as always, on whichever order they're handed.
 *
 * Options themselves aren't localized (`options.name` is a single proper-name
 * column, ADR-0011 schema) — only the category label needs English.
 */
export async function englishNames(
  order: AdminOrder,
  deps: { getDesignDetail?: typeof getDesignDetail } = {}
): Promise<AdminOrder> {
  const resolveDesign = deps.getDesignDetail ?? getDesignDetail;
  const items = await Promise.all(
    order.items.map((it) => englishNamesForItem(it, resolveDesign))
  );
  return { ...order, items };
}

async function englishNamesForItem(
  item: AdminOrderItem,
  resolveDesign: typeof getDesignDetail
): Promise<AdminOrderItem> {
  const productName = item.productNameEn ?? item.productName;
  const snapshot = item.configSnapshot;
  if (!snapshot?.designSlug) return { ...item, productName };

  const detail = await resolveDesign(snapshot.designSlug);
  if (!detail) return { ...item, productName }; // design gone → keep the frozen spec

  const designName =
    detail.nameEn || snapshot.designNameEn || snapshot.designName || productName;
  let selections = snapshot.selections ?? [];

  if (item.configCode) {
    try {
      const codec = toCodecDesign(detail);
      if (codec) {
        const { selections: sel } = decodeConfigCode(item.configCode, (c) =>
          c.toUpperCase() === (detail.code ?? "").toUpperCase() ? codec : null
        );
        selections = detail.categories.map((cat) => {
          const opt = cat.options.find((o) => o.id === sel[cat.slug]);
          return {
            label: cat.labelEn || cat.labelNo || cat.slug,
            option: opt?.name ?? "",
            hex: opt?.hex ?? null,
          };
        });
      }
    } catch (e) {
      if (!(e instanceof ConfigCodeError)) throw e;
      // malformed/legacy code → keep the frozen selections as they were
    }
  }

  return { ...item, productName, configSnapshot: { ...snapshot, designName, selections } };
}

/** Download + composite the plate for one item; null on any failure (degrade). */
async function composeItemPlate(
  supabase: Supa,
  item: AdminOrderItem
): Promise<Buffer | null> {
  const layers = await resolveItemLayers(item);
  if (layers.length === 0) return null;

  const composeLayers: ComposeLayer[] = [];
  for (const l of layers) {
    const { data, error } = await supabase.storage.from("assets").download(l.src);
    if (error || !data) continue; // missing layer → degrade
    composeLayers.push({
      bytes: Buffer.from(await data.arrayBuffer()),
      blend: l.blend,
    });
  }
  if (composeLayers.length === 0) return null;
  try {
    return await composePlate(composeLayers);
  } catch {
    return null; // never let image trouble block the PDF
  }
}

/** Download + shrink the ordered product's photo for one item; null on any
 *  failure (degrade). F32: the photo path is the Storage master; we download it
 *  directly (F26 rule) and resize via sharp — never embed webp or the raw master. */
async function composeItemPhoto(
  supabase: Supa,
  item: AdminOrderItem
): Promise<Buffer | null> {
  if (!item.productImage) return null; // product_id NULL or no image → no photo
  try {
    const { data, error } = await supabase.storage
      .from("assets")
      .download(item.productImage);
    if (error || !data) return null;
    return await resizeProductPhoto(Buffer.from(await data.arrayBuffer()));
  } catch {
    return null; // never let image trouble block the PDF (F08 invariant)
  }
}

/**
 * Render the production-order PDF for ONE supplier of an order. Returns the PDF
 * bytes, or null when that supplier has no items. The plate image degrades
 * gracefully (text spec stays authoritative).
 */
export async function renderSupplierPdf(
  order: AdminOrder,
  supplierId: string
): Promise<Buffer | null> {
  const englishOrder = await englishNames(order);
  const doc = buildLabPdfDoc(englishOrder, supplierId);
  if (!doc) return null;

  const supabase = await createClient();
  const items = englishOrder.items.filter((i) => i.supplierId === supplierId);

  const renderItems: LabPdfRenderItem[] = await Promise.all(
    items.map(async (it, idx) => {
      const [plate, photo] = await Promise.all([
        composeItemPlate(supabase, it),
        composeItemPhoto(supabase, it),
      ]);
      return {
        item: doc.items[idx],
        plateDataUri: plate ? `data:image/png;base64,${plate.toString("base64")}` : null,
        productPhotoDataUri: photo
          ? `data:image/png;base64,${photo.toString("base64")}`
          : null,
      };
    })
  );

  return renderToBuffer(<LabPdfDocument doc={doc} items={renderItems} />);
}
