import "server-only";

import { renderToBuffer } from "@react-pdf/renderer";
import type { createServiceRoleClient } from "@/lib/supabase/service";
import { getDesignDetailSafe } from "@/lib/catalog/design-options";
import {
  decodeConfigCode,
  toCodecDesign,
  ConfigCodeError,
} from "@/lib/configurator/config-code";
import { getPreviewLayers, type SelectedCategory } from "@/lib/configurator/preview";
import { composePlate, type ComposeLayer } from "./compose-plate";
import { buildCustomerPdfDoc, type CustomerPdfInput } from "./customer-pdf-content";
import { CustomerPdfDocument } from "./customer-pdf";

/**
 * R4-PDF-CLIENTE — L'UNICO punto in cui il riepilogo cliente viene generato.
 *
 * Gira dentro il lavoro differito di `after()` (R4-MAIL-JOURNEY §E), quindi:
 *  - il client Supabase arriva come PARAMETRO e non viene costruito qui. Il
 *    renderer del PDF lab (`lab-pdf.server.tsx:104`) si istanzia da solo quello
 *    a cookie, ed è esattamente il motivo per cui non è richiamabile da lì;
 *  - la lettura del design passa da `getDesignDetailSafe`, perché
 *    `unstable_cache` lancia fuori dal contesto di richiesta;
 *  - niente lancia mai: un'eccezione dentro `after()` non risale a nessuno.
 *
 * 🔒 INVARIANTE: l'unico lettore di questo bucket è il service role, dietro
 * l'autenticazione admin. Nessuna superficie pubblica risolve un PDF. Una card
 * futura che volesse darlo al cliente deve riaprire quella decisione (NOTA 2/9
 * sui riusi), non aggiungere un endpoint.
 */

export const CUSTOMER_PDF_BUCKET = "order-pdfs";
export const customerPdfPath = (orderId: string) => `summaries/${orderId}.pdf`;

type Db = ReturnType<typeof createServiceRoleClient>;

/** I layer di compositing del design scelto, o [] se non risolvibili (→ nessuna
 *  immagine, il documento resta valido). Stessa logica di `resolveItemLayers`
 *  in `lab-pdf.server.tsx`, ma su un item di PAYLOAD e con la lettura sicura. */
async function resolveLayers(
  designSlug: string | undefined,
  configCode: string | undefined
): Promise<{ src: string; blend: "normal" | "multiply" }[]> {
  if (!designSlug || !configCode) return [];
  const detail = await getDesignDetailSafe(designSlug);
  if (!detail) return [];
  const codec = toCodecDesign(detail);
  if (!codec) return [];

  let selections: Record<string, string> = {};
  try {
    ({ selections } = decodeConfigCode(configCode, (c) =>
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

/** Scarica un oggetto dal bucket PUBBLICO `assets`; null su qualunque intoppo. */
async function downloadAsset(db: Db, path: string): Promise<Buffer | null> {
  try {
    const { data, error } = await db.storage.from("assets").download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/** L'anteprima composita. Null a ogni intoppo: un'immagine mancante non deve mai
 *  fermare il PDF (stessa invariante di `lab-pdf.server.tsx:70-73`). */
async function composeDesignPlate(db: Db, input: CustomerPdfInput): Promise<string | null> {
  const snap = input.items.find((i) => i.configSnapshot)?.configSnapshot as
    | { designSlug?: string }
    | undefined;
  const configCode = input.items.find((i) => i.configCode)?.configCode;
  const layers = await resolveLayers(snap?.designSlug, configCode);
  if (layers.length === 0) return null;

  const composeLayers: ComposeLayer[] = [];
  for (const l of layers) {
    const bytes = await downloadAsset(db, l.src);
    if (!bytes) continue; // layer mancante → degrada
    composeLayers.push({ bytes, blend: l.blend });
  }
  if (composeLayers.length === 0) return null;
  try {
    const png = await composePlate(composeLayers);
    return png ? `data:image/png;base64,${png.toString("base64")}` : null;
  } catch {
    return null;
  }
}

/**
 * Genera E archivia il riepilogo.
 *
 * I due esiti sono INDIPENDENTI, ed è deliberato: `pdf` sono i byte da allegare
 * alla mail — il rendering è la parte costosa, e a quel punto è già riuscito —
 * mentre `stored` dice soltanto se l'oggetto è finito nel bucket. Un upload
 * fallito costa il recupero dal back office per QUELL'ordine, non l'allegato
 * che il cliente stava per ricevere.
 *
 * NON lancia mai: il chiamante gira dentro `after()`.
 */
export async function renderAndStoreCustomerPdf(
  db: Db,
  input: CustomerPdfInput & { orderId: string }
): Promise<{ pdf: Buffer | null; stored: boolean }> {
  let pdf: Buffer | null = null;
  try {
    const doc = buildCustomerPdfDoc(input);
    const [plateDataUri, qrBytes] = await Promise.all([
      composeDesignPlate(db, input),
      input.vipps.qrImage ? downloadAsset(db, input.vipps.qrImage) : Promise.resolve(null),
    ]);
    pdf = await renderToBuffer(
      <CustomerPdfDocument
        doc={doc}
        plateDataUri={plateDataUri}
        qrDataUri={qrBytes ? `data:image/png;base64,${qrBytes.toString("base64")}` : null}
      />
    );
  } catch (e) {
    console.error(`order ${input.code}: summary PDF not rendered`, e);
    return { pdf: null, stored: false };
  }

  let stored = false;
  try {
    const { error } = await db.storage
      .from(CUSTOMER_PDF_BUCKET)
      .upload(customerPdfPath(input.orderId), pdf, {
        contentType: "application/pdf",
        upsert: false,
      });
    stored = !error;
    if (error) console.error(`order ${input.code}: summary stored nowhere`, error);
  } catch (e) {
    console.error(`order ${input.code}: summary stored nowhere`, e);
  }

  // I byte tornano comunque: l'allegato non paga per un fallimento dello Storage.
  return { pdf, stored };
}

/**
 * I byte già archiviati, o null se non ce ne sono (ordine anteriore alla
 * feature, o upload fallito). NON rigenera MAI: la generazione ha un punto solo,
 * e non è questo.
 */
export async function fetchStoredCustomerPdf(
  db: Db,
  orderId: string
): Promise<Buffer | null> {
  try {
    const { data, error } = await db.storage
      .from(CUSTOMER_PDF_BUCKET)
      .download(customerPdfPath(orderId));
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}
