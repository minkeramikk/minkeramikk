import "server-only";

import sharp from "sharp";

/**
 * Server-side plate compositing for the production-order PDF (F08).
 *
 * Mirrors the live preview model (ADR 0002): layers stack bottom→top, colour/
 * pattern layers blend `multiply`, the animal shape blends `normal`. Here the
 * caller passes already-ordered layer bytes; we flatten them onto a white
 * square. A missing/unreadable layer is simply skipped by the caller (degrade)
 * — the textual spec (name + hex) stays authoritative in the PDF.
 */
export interface ComposeLayer {
  bytes: Buffer;
  blend: "normal" | "multiply";
}

export async function composePlate(
  layers: ComposeLayer[],
  size = 480
): Promise<Buffer | null> {
  if (layers.length === 0) return null;

  // normalise every layer to the same transparent square
  const normalised = await Promise.all(
    layers.map((l) =>
      sharp(l.bytes)
        .resize(size, size, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png()
        .toBuffer()
    )
  );

  const base = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  return base
    .composite(
      normalised.map((input, i) => ({
        input,
        blend: layers[i].blend === "multiply" ? "multiply" : "over",
      }))
    )
    .png()
    .toBuffer();
}

/**
 * Shrink a product photo (the untouched Storage master, e.g. 1277²) to a small
 * PNG thumbnail for the lab PDF (F32). @react-pdf only embeds PNG/JPEG — never
 * webp — and we must keep the document light, so we never embed the raw master.
 * `fit: "inside"` keeps the aspect ratio (no distortion). Returns null on any
 * decode/resize failure so a bad photo can never block PDF generation.
 */
export async function resizeProductPhoto(
  bytes: Buffer,
  size = 208
): Promise<Buffer | null> {
  try {
    return await sharp(bytes)
      .resize(size, size, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}
