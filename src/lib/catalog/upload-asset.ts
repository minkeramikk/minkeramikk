import "server-only";
import { uploadVariant } from "@/lib/asset-variant-image";
import type { createClient } from "@/lib/supabase/server";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Cache fix (Bug 1): a fresh token before the extension → a brand-new Storage
 *  path on every upload, so CDN/browser never serve a stale copy. No `?v=`. */
export function cacheBustPath(path: string, token = crypto.randomUUID().slice(0, 8)): string {
  return path.replace(/(\.[a-z0-9]+)$/i, `-${token}$1`);
}

/** Upload a file to a UNIQUE path (cacheBustPath) + best-effort F26 variant.
 *  Returns the stored (token'd) path, or {} when no file was provided. */
export async function uploadAsset(
  supabase: Awaited<ReturnType<typeof createClient>>,
  file: FormDataEntryValue | null,
  path: string
): Promise<{ path?: string; error?: string }> {
  if (!(file instanceof File) || file.size === 0) return {};
  if (!IMAGE_TYPES.includes(file.type)) return { error: "Images must be PNG, JPG or WebP." };
  const unique = cacheBustPath(path);
  const buf = Buffer.from(await file.arrayBuffer());
  const up = await supabase.storage
    .from("assets")
    .upload(unique, buf, { contentType: file.type, upsert: false });
  if (up.error) return { error: "Could not upload the image." };
  await uploadVariant(supabase, unique, buf); // variant basename tracks the token'd master
  return { path: unique };
}
