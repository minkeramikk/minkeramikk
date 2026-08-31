/**
 * Vipps payment details (R4-TAKK). PURE — no DB, no React: the thank-you page
 * and the order email both render from this shape, and the email builder must
 * stay unit-testable (email-html.ts imports nothing server-only).
 *
 * The shop is paid BY HAND, in two instalments (deposit after we confirm the
 * design, balance before shipping). These details are INFORMATION, never a
 * charge: no amount and no message travel with them, which is exactly why the
 * customer has to type the order number into the Vipps "melding" field himself.
 *
 * The DB read lives in `vipps.server.ts` (`getVippsSettings`).
 */

export interface VippsSettings {
  /** Storage path in the `assets` bucket — resolve with assetUrl(). */
  qrImage: string | null;
  /** Recipient number, displayed verbatim (never parsed). */
  number: string | null;
  /** The qr.vipps.no address the QR encodes. Kept for the shop's own records. */
  link: string | null;
}

export const NO_VIPPS: VippsSettings = { qrImage: null, number: null, link: null };

/**
 * Whether the payment block may be shown at all. The QR alone and the number
 * alone are both legitimate states — only "neither" hides the block, and then
 * the page (and the email) must still read as complete without it.
 */
export function hasVippsDetails(v: VippsSettings): boolean {
  return Boolean(v.qrImage || v.number);
}
