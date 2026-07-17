import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { makeVariant } from "./asset-variant-image.ts";

// A 40×20 landscape master tagged EXIF orientation 6 (rotate 90° CW on display).
// After `.rotate()` the pixels become 20×40 portrait; without it they stay 40×20.
async function orientedMaster(): Promise<Buffer> {
  return sharp({
    create: { width: 40, height: 20, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
}

describe("makeVariant EXIF orientation (F36)", () => {
  it("applies EXIF orientation so portrait-shot photos are not served sideways", async () => {
    const v = await makeVariant(await orientedMaster(), "design-photos/x/abc.jpg");
    expect(v).not.toBeNull();
    const meta = await sharp(v!.data).metadata();
    // orientation honored → height > width
    expect(meta.height! > meta.width!).toBe(true);
  });
});
