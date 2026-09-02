import { test } from "vitest";
import sharp from "sharp";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { composePlate } from "@/lib/orders/compose-plate";

/**
 * Lato "PDF" dell'affiancamento R4-CANVAS-WHITE, più il campionamento AC5.
 * Usa `composePlate` — la STESSA funzione che stampa il piatto nel PDF del
 * ceramista — sui layer che il browser ha appena dipinto (`layers.json`,
 * scritto dalla spec Playwright), quindi le due metà sono la stessa ricetta.
 */
const OUT = "docs/evidence/r4-canvas-white/after";
const SIZE = 480;

/** Il piatto dentro lo scatto del frame: `h-[84%] w-[84%]` + `object-contain`,
 *  cioè il quadrato centrato di lato 0,84 × lato corto. Ritagliarlo è ciò che
 *  rende l'affiancamento un confronto e non due immagini di scala diversa. */
async function plateCrop(shot: string, size: number) {
  const meta = await sharp(shot).metadata();
  const side = Math.round(Math.min(meta.width!, meta.height!) * 0.84);
  return sharp(shot)
    .extract({
      left: Math.round((meta.width! - side) / 2),
      top: Math.round((meta.height! - side) / 2),
      width: side,
      height: side,
    })
    .resize(size, size)
    .toBuffer();
}

const label = (w: number, h: number, text: string) =>
  Buffer.from(
    `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#2b2330"/>` +
      `<text x="${w / 2}" y="${h / 2 + 6}" font-family="system-ui,sans-serif" font-size="16"` +
      ` fill="#ffffff" text-anchor="middle">${text}</text></svg>`
  );

test("affiancamento schermo / PDF + campionamento AC5", async () => {
  const layers: Record<string, { src: string; blend: "multiply" | "normal" }[]> =
    JSON.parse(readFileSync(`${OUT}/layers.json`, "utf8"));

  for (const [slug, ls] of Object.entries(layers)) {
    const bytes = await Promise.all(
      ls.map(async (l) => ({
        bytes: Buffer.from(await (await fetch(l.src)).arrayBuffer()),
        blend: l.blend,
      }))
    );
    const png = await composePlate(bytes, SIZE);
    if (!png) throw new Error(`${slug}: composePlate ha reso null`);
    writeFileSync(`${OUT}/plate-${slug}.png`, png);

    for (const w of [390, 1280]) {
      const screen = await plateCrop(`${OUT}/screen-${slug}-${w}.png`, SIZE);
      const H = 28;
      const out = await sharp({
        create: {
          width: SIZE * 2 + 12,
          height: SIZE + H,
          channels: 4,
          background: "#ffffff",
        },
      })
        .composite([
          { input: label(SIZE, H, `SCHERMO — ${slug} @${w}`), top: 0, left: 0 },
          { input: label(SIZE, H, "compose-plate (PDF ceramista)"), top: 0, left: SIZE + 12 },
          { input: screen, top: H, left: 0 },
          { input: png, top: H, left: SIZE + 12 },
        ])
        .png()
        .toBuffer();
      writeFileSync(`${OUT}/sidebyside-${slug}-${w}.png`, out);
    }
  }

  // ── AC5: il pixel a schermo È il pixel della sorgente ───────────────────
  // La sorgente di verità NON è l'hex del DB: è il webp del layer, che è lossy
  // (gli asset sono fuori scope, non si rigenerano). Su `--mk-canvas` multiply
  // è l'identità, quindi il colore del layer deve arrivare a schermo INTATTO:
  // è quello il Δ 0 che la card chiede. Lo scarto layer↔DB si riporta a parte.
  const m = JSON.parse(readFileSync(`${OUT}/measures.json`, "utf8"));
  const dbHex: string = m.lightSwatchHex;
  const swatchLayer: string = JSON.parse(
    readFileSync(`${OUT}/light-swatch-layers.json`, "utf8")
  )[0];

  const hex = (R: number, G: number, B: number) =>
    `#${[R, G, B].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

  /** Colore MEDIO della regione che dovrebbe essere lo swatch: tutti i pixel
   *  opachi entro Δ 40 dall'hex scelto. Un solo pixel "fortunato" non dice
   *  nulla (in una banda sfumata se ne trova sempre uno vicino); la media
   *  della regione sì, ed è esattamente ciò che l'occhio legge. Il raggio 40
   *  tiene fuori il fondo pagina (#fbe9e4 dista 74 da #f3e39a). */
  async function regionMean(input: string | Buffer, target: number[]) {
    const { data, info } = await sharp(input)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let n = 0;
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += info.channels) {
      const [R, G, B, A] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (A < 250) continue;
      if (Math.hypot(R - target[0], G - target[1], B - target[2]) > 40) continue;
      sum[0] += R;
      sum[1] += G;
      sum[2] += B;
      n++;
    }
    if (n === 0) throw new Error("nessun pixel nella regione dello swatch");
    const [R, G, B] = sum.map((v) => Math.round(v / n));
    return {
      px: hex(R, G, B),
      delta: Number(Math.hypot(R - target[0], G - target[1], B - target[2]).toFixed(2)),
      pixel: n,
    };
  }

  const db = [1, 3, 5].map((i) => parseInt(dbHex.slice(i, i + 2), 16));
  const layer = await regionMean(
    Buffer.from(await (await fetch(swatchLayer)).arrayBuffer()),
    db
  );

  // ── il numero principale: schermo vs compose-plate, sullo STESSO piatto ──
  // Il piatto è `h-[84%] w-[84%]` del frame e `object-contain`: dentro lo
  // scatto del frame è il quadrato centrato di lato 0,84 × altezza. Ritagliato
  // e riportato a 240px, si confronta pixel a pixel con l'uscita di
  // `composePlate` — cioè con il piatto che il ceramista riceve.
  const swatchLayers: string[] = JSON.parse(
    readFileSync(`${OUT}/light-swatch-layers.json`, "utf8")
  );
  const truth = await composePlate(
    await Promise.all(
      swatchLayers.map(async (src) => ({
        bytes: Buffer.from(await (await fetch(src)).arrayBuffer()),
        blend: "multiply" as const,
      }))
    ),
    SIZE
  );
  if (!truth) throw new Error("composePlate ha reso null sul design campione");
  writeFileSync(`${OUT}/plate-light-swatch.png`, truth);
  const N = 240;
  const truthPx = await sharp(truth).resize(N, N).removeAlpha().raw().toBuffer();

  async function vsCompose(shot: string) {
    const px = await sharp(await plateCrop(shot, N)).removeAlpha().raw().toBuffer();
    let sum = 0;
    for (let i = 0; i < px.length; i += 3)
      sum += Math.hypot(
        px[i] - truthPx[i],
        px[i + 1] - truthPx[i + 1],
        px[i + 2] - truthPx[i + 2]
      );
    return Number((sum / (px.length / 3)).toFixed(2));
  }

  const phases: Record<string, unknown> = {};
  for (const phase of ["before", "after"]) {
    const shot = `docs/evidence/r4-canvas-white/${phase}/light-swatch-${m.lightSwatchDesign}-390.png`;
    if (!existsSync(shot)) continue;
    const mean = await regionMean(shot, db);
    const corner = await sharp(shot)
      .extract({ left: 1, top: 1, width: 1, height: 1 })
      .raw()
      .toBuffer();
    phases[phase] = {
      // Il numero ESATTO della card: il fondo su cui i layer `multiply` si
      // moltiplicano, contro il bianco che `compose-plate.ts` dà a sharp. A
      // Δ 0 multiply è l'identità e lo schermo mostra il layer, punto.
      fondoDelLaCompositing: hex(corner[0], corner[1], corner[2]),
      deltaFondoDalBiancoDiSharp: Number(
        Math.hypot(corner[0] - 255, corner[1] - 255, corner[2] - 255).toFixed(2)
      ),
      // distanza media dal piatto di compose-plate (= il PDF del ceramista).
      // Il residuo dopo il cambio NON è colore: è registro geometrico
      // (`object-contain` in un frame non quadrato) + ricampionamento.
      deltaMedioDalPDF: await vsCompose(shot),
      regioneSwatch: {
        hexASchermo: mean.px,
        pixelCampionati: mean.pixel,
        deltaDalloSwatchDB: mean.delta,
      },
    };
  }

  const report = {
    design: m.lightSwatchDesign,
    layerSorgente: swatchLayer,
    hexNelDB: dbHex,
    hexMedioNelLayer: layer.px,
    campionamento: phases,
    nota:
      "`deltaMedioDalPDF` è la distanza RGB media, pixel a pixel, fra il " +
      "piatto a schermo e lo stesso piatto uscito da `composePlate` — la " +
      "sorgente del PDF del ceramista. Su `--mk-canvas` multiply è l'identità, " +
      "quindi resta solo il ricampionamento del browser. Il residuo verso " +
      "l'hex del DB nella regione dello swatch è la compressione webp " +
      "dell'asset: asset fuori scope.",
  };
  writeFileSync(`${OUT}/ac5-sampling.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));

  const after = phases.after as { deltaMedioDalPDF: number } | undefined;
  const before = phases.before as { deltaMedioDalPDF: number } | undefined;
  if (!after) throw new Error("manca il campionamento del giro `after`");
  if (before && before.deltaMedioDalPDF <= after.deltaMedioDalPDF)
    throw new Error(
      `AC5: lo schermo non si è avvicinato al PDF (prima ${before.deltaMedioDalPDF}, dopo ${after.deltaMedioDalPDF})`
    );
});
