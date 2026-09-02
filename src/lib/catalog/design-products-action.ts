"use server";

import { getActiveDesigns } from "./designs";
import { getDesignProducts } from "./products";

/**
 * R4-FIX Ⓔ — the ceramics each design in the cart actually offers, keyed by
 * slug (`design_products`, ADR 0017; a design without a whitelist answers with
 * the supplier's whole visible set, exactly as step 3 shows it).
 *
 * The cart holds lines of different designs and knows only their slugs, so the
 * upsell engine cannot check the donor's whitelist from the browser. Both reads
 * underneath are already cached under the `catalog` tag, so this adds a round
 * trip, not a query: an unknown slug is simply absent from the answer, which
 * the caller reads as "no offer" rather than "any offer".
 */
export async function designProductIds(
  slugs: string[]
): Promise<Record<string, string[]>> {
  const designs = await getActiveDesigns();
  const out: Record<string, string[]> = {};
  await Promise.all(
    [...new Set(slugs)].map(async (slug) => {
      const design = designs.find((d) => d.slug === slug);
      if (!design) return;
      const products = await getDesignProducts(design.id, design.supplierId);
      out[slug] = products.map((p) => p.id);
    })
  );
  return out;
}
