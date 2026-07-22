import "server-only";

import { getActiveDesigns } from "@/lib/catalog/designs";
import { getDesignDetail } from "@/lib/catalog/design-options";
import { getDesignProducts } from "@/lib/catalog/products";
import { assetUrl } from "@/lib/storage";
import {
  decodeConfigCode,
  toCodecDesign,
  type CodecDesign,
} from "@/lib/configurator/config-code";
import { buildConfigLinePayload } from "@/lib/configurator/line-payload";
import type { SetEntry } from "@/lib/cart/set-code";
import type { CartLine } from "@/lib/cart/cart";

/** Una riga risolta: cart line senza identità locale (la assegna il client). */
export type ResolvedLine = Omit<CartLine, "id">;

export type ResolvedCartEntry =
  | {
      ok: true;
      line: ResolvedLine;
      /**
       * categorySlug → optionId decodificate dal codice. Servono SOLO alla
       * landing `?set=` (`context.selections` → `consumeSetParam`, che fissa gli
       * `opt_*` in URL): senza, la landing torna a mostrare le ceramiche di un
       * altro design (bug 4, R-EXTRA). NON escono dalla route /api/cart/validate.
       */
      selections: Record<string, string>;
      acceptsCustomNotes: boolean;
      acceptsCustomText: boolean;
    }
  | { ok: false; reason: "design" | "product" | "code" };

/**
 * CA-3 + F40 — risolve entry (config code + slug ceramica + quantità) contro il
 * catalogo VIVO. Unico posto dove si decide se una riga esiste ancora:
 * lo usano sia la landing `?set=` sia la validazione del carrello salvato.
 *
 * Ogni lettura passa dalla data cache taggata `catalog` (designs, dettagli,
 * prodotti per design), quindi il costo su cache calda è ~0 query. Il set può
 * essere multi-fornitore (ADR 0007). I prezzi non arrivano MAI dall'input:
 * ogni riga si ri-prezza dal prodotto di catalogo. I codici si ri-encodano in
 * forma canonica: un codice il cui risultato differisce dall'input segnala al
 * chiamante che le opzioni sono state adattate.
 *
 * Degrado, mai fallimento: una riga che non risolve diventa `{ok:false}`,
 * le altre sopravvivono. L'array in uscita ha la STESSA lunghezza e lo stesso
 * ordine di quello in ingresso.
 */
export async function resolveCartEntries(
  entries: SetEntry[]
): Promise<ResolvedCartEntry[]> {
  if (entries.length === 0) return [];

  const designs = await getActiveDesigns();
  const details = await Promise.all(designs.map((d) => getDesignDetail(d.slug)));

  const codecBySlug = new Map<string, CodecDesign>();
  for (const detail of details) {
    const codec = detail && toCodecDesign(detail);
    if (codec) codecBySlug.set(codec.slug, codec);
  }
  const findByCode = (code: string) =>
    [...codecBySlug.values()].find((d) => d.code === code.toUpperCase()) ?? null;

  const productsByDesign = new Map<string, ReturnType<typeof getDesignProducts>>();
  const designProducts = (designId: string, supplierId: string) => {
    let p = productsByDesign.get(designId);
    if (!p) {
      p = getDesignProducts(designId, supplierId);
      productsByDesign.set(designId, p);
    }
    return p;
  };

  const out: ResolvedCartEntry[] = [];
  for (const entry of entries) {
    try {
      const decoded = decodeConfigCode(entry.configCode, findByCode);
      const design = designs.find((d) => d.slug === decoded.designSlug);
      const detail = details.find((d) => d?.slug === decoded.designSlug);
      if (!design || !detail) {
        out.push({ ok: false, reason: "design" });
        continue;
      }
      const products = await designProducts(design.id, design.supplierId);
      const product = products.find((p) => p.slug === entry.productSlug);
      if (!product) {
        // nascosto, cancellato, O fuori dalla whitelist del design (F34 AC5)
        out.push({ ok: false, reason: "product" });
        continue;
      }
      const { snapshot, configCode, designLayers } = buildConfigLinePayload(
        detail,
        decoded.selections
      );
      out.push({
        ok: true,
        acceptsCustomNotes: detail.acceptsCustomNotes,
        acceptsCustomText: detail.acceptsCustomText,
        selections: decoded.selections,
        line: {
          productId: product.id,
          productNameNo: product.nameNo,
          productNameEn: product.nameEn,
          supplierId: design.supplierId,
          supplierName: design.supplierName ?? "",
          unitPriceCents: product.price.amountCents,
          currency: product.price.currency,
          quantity: entry.qty,
          configCode,
          configSnapshot: snapshot,
          layers: designLayers,
          plateImage: product.image ? assetUrl(product.image) : undefined,
          productSlug: product.slug,
          pieces: product.pieces,
        },
      });
    } catch {
      // codice non decodificabile (design sconosciuto, spazzatura)
      out.push({ ok: false, reason: "code" });
    }
  }
  return out;
}
