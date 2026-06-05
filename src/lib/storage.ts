/**
 * Public URLs for the `assets` Storage bucket (TODO 1.4 path convention).
 * With a width, uses the on-the-fly image transform endpoint (no
 * pre-generated variants); otherwise the plain public object URL.
 */
export function assetUrl(path: string, opts?: { width?: number }): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (opts?.width) {
    return `${base}/storage/v1/render/image/public/assets/${path}?width=${opts.width}`;
  }
  return `${base}/storage/v1/object/public/assets/${path}`;
}
