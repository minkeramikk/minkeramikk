/**
 * Seller identity (R4-PDF-CLIENTE, change order 2/9). PURE — no DB, no React:
 * the customer summary's content builder is pure and unit-tested, so the shape
 * it reads has to be importable without `server-only`. Exact twin of
 * `vipps.ts`, whose DB read lives in `vipps.server.ts`; this one's is in
 * `seller.server.ts`.
 *
 * Every field is nullable because none of them is known yet: they are filled in
 * by hand in SQL (migration 0038 — there is no settings admin page), and the
 * document DEGRADES PER FIELD. A missing field takes its line with it; there is
 * never a label without a value and never a placeholder.
 */

export interface SellerIdentity {
  name: string | null;
  address: string | null;
  /** Organisasjonsnummer, displayed verbatim (never parsed or reformatted). */
  orgNumber: string | null;
  /**
   * In MVA-registeret. FALSE until registration is a FACT: below the 50 000 kr
   * threshold a business is not registered, and printing "MVA 25 %" then is
   * illegal. Governs both the VAT line and the org number's " MVA" suffix.
   */
  vatRegistered: boolean;
  email: string | null;
  phone: string | null;
}

export const NO_SELLER: SellerIdentity = {
  name: null,
  address: null,
  orgNumber: null,
  vatRegistered: false,
  email: null,
  phone: null,
};
