/**
 * F26: build + upload the resized WebP variant of a master image (sharp).
 * Server-side only (upload actions) and the backfill script — never import
 * from client components. The script imports this file directly (Node 24
 * type stripping), so keep imports relative and the syntax erasable.
 */
import sharp from "sharp";
// explicit .ts extension: this file is ALSO imported by the backfill script
// under plain Node (type stripping), where ESM resolution needs the extension
import { variantPath, variantWidth, assetClass } from "./asset-variants.ts";

export interface VariantFile {
  path: string;
  data: Buffer;
  contentType: "image/webp";
  /** 1 year — variants are immutable derivatives (fixes the 1h TTL flagged by Lighthouse). */
  cacheControl: string;
}

/**
 * Resize a master to its class width and recompress to WebP, or null when the
 * path has no variant class. `fit: "inside"` never alters the aspect ratio —
 * square compositing layers stay square (the reason Supabase `render/image`
 * was rejected, see storage.ts).
 */
export async function makeVariant(
  master: Buffer,
  path: string
): Promise<VariantFile | null> {
  const width = variantWidth(path);
  if (!width) return null;
  const target = variantPath(path, width);
  if (!target) return null;
  // products are photos → they take harder compression than the flat-color layers
  const quality = assetClass(path) === "products" ? 70 : 80;
  const data = await sharp(master)
    .rotate() // F36: bake EXIF orientation before resize (no-op for EXIF-less masters)
    .resize(width, width, { fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
  return { path: target, data, contentType: "image/webp", cacheControl: "31536000" };
}

/** Minimal structural slice of a Supabase client (server client and script client differ). */
interface StorageUploader {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        data: Buffer,
        opts: { contentType: string; cacheControl: string; upsert: boolean }
      ): Promise<{ error: { message: string } | null }>;
    };
  };
}

/**
 * Best-effort variant upload next to a freshly uploaded master (F10
 * resize-at-source). Never throws: a variant is an optimization — if it's
 * missing, the client-side onError fallback serves the master.
 */
export async function uploadVariant(
  supabase: StorageUploader,
  masterPath: string,
  master: Buffer
): Promise<void> {
  try {
    const v = await makeVariant(master, masterPath);
    if (!v) return;
    await supabase.storage.from("assets").upload(v.path, v.data, {
      contentType: v.contentType,
      cacheControl: v.cacheControl,
      upsert: true, // re-uploading a master must refresh its variant
    });
  } catch {
    // swallow — see above
  }
}
