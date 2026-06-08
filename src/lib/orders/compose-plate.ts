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
