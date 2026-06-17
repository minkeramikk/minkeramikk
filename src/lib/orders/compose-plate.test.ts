import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { composePlate, resizeProductPhoto } from "./compose-plate";

async function solid(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({
    create: { width: 20, height: 20, channels: 4, background: { r, g, b, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

describe("composePlate (sharp multiply)", () => {
  it("returns null for no layers", async () => {
    expect(await composePlate([])).toBeNull();
  });

  it("composes layers into a square PNG of the requested size", async () => {
    const out = await composePlate(
      [
        { bytes: await solid(255, 0, 0), blend: "normal" },
        { bytes: await solid(0, 0, 255), blend: "multiply" },
      ],
      120
    );
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(120);
  });

  it("multiply of red×blue ≈ black at the centre (commutative tint model)", async () => {
    const out = await composePlate(
      [
        { bytes: await solid(255, 0, 0), blend: "normal" },
        { bytes: await solid(0, 0, 255), blend: "multiply" },
      ],
      40
    );
    const { data, info } = await sharp(out!)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const cx = Math.floor(info.width / 2);
    const cy = Math.floor(info.height / 2);
    const idx = (cy * info.width + cx) * info.channels;
    // red (255,0,0) × blue (0,0,255) under multiply → near black
    expect(data[idx]).toBeLessThan(40); // R
    expect(data[idx + 2]).toBeLessThan(40); // B
  });

  it("a single layer still composes (degrade case: others were skipped)", async () => {
    const out = await composePlate([{ bytes: await solid(0, 128, 0), blend: "multiply" }], 60);
    const meta = await sharp(out!).metadata();
    expect(meta.width).toBe(60);
  });
});

describe("resizeProductPhoto (F32 PDF thumbnail)", () => {
  async function square(side: number): Promise<Buffer> {
    return sharp({
      create: { width: side, height: side, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .png()
      .toBuffer();
  }

  it("shrinks a large master to a PNG within the requested box", async () => {
    const out = await resizeProductPhoto(await square(1277), 208);
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(208); // square in → square out, no distortion
    expect(meta.height).toBe(208);
  });

  it("never enlarges a small photo", async () => {
    const out = await resizeProductPhoto(await square(80), 208);
    const meta = await sharp(out!).metadata();
    expect(meta.width).toBe(80);
  });

  it("returns null on undecodable bytes (degrade, never blocks the PDF)", async () => {
    expect(await resizeProductPhoto(Buffer.from("not an image"))).toBeNull();
  });
});
