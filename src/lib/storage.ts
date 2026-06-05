/**
 * Public URLs for the `assets` Storage bucket (TODO 1.4 path convention).
 *
 * NOTE: we deliberately do NOT use the `render/image` transform endpoint.
 * On this project it does not preserve aspect ratio (a square 1500×1500
 * source returned 800×1500 for `?width=800`), which distorted the
 * compositing layers and clipped round borders in the preview. The stored
 * objects are already correctly sized squares, so we serve them directly.
 * `width` is accepted for call-site intent but currently informational only.
 */
export function assetUrl(path: string, _opts?: { width?: number }): string {
  void _opts;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/assets/${path}`;
}
