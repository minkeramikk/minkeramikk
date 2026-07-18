/**
 * Order payload schema (F05) — shared by the client form and the server route,
 * so validation is identical on both sides. Pure zod, no React/DB.
 */
import { z } from "zod";
import { CURRENCIES } from "@/lib/money/money";

/** R2-2b AC7: hard cap on the customer's free-text colour note. */
export const MAX_CUSTOM_NOTE = 250;

/** F38: hard cap on the customer's inscription on the ceramic (100 chars). */
export const MAX_CUSTOM_TEXT = 100;

/** F38 — sanitise for the UNTRUSTED read path (URL → snapshot): same cleaner as
 *  the note (trim + strip control chars), then TRUNCATE to the cap. A URL can't
 *  be rejected gracefully, so we truncate rather than 400. Whitespace-only → ""
 *  (the cleaner trims first), which every present-check then treats as absent. */
export function cleanCustomText(input: string): string {
  return cleanCustomNote(input).slice(0, MAX_CUSTOM_TEXT);
}

/** Strip ASCII/Unicode control chars (except newline) and trim. The XSS escape
 *  itself happens at each sink (email HTML); here we only normalise the input. */
export function cleanCustomNote(input: string): string {
  // Strip ASCII control chars (keep \n = \x0A), DEL and the C1 block.
  return input.replace(/[\x00-\x09\x0B-\x1F\x7F-\x9F]/g, "").trim();
}

/** A note value: cleaned, then capped. Over the cap → the payload is rejected
 *  (a gentle 400 at the route, never a crash). Client caps at 250 too (UX). */
const customNoteSchema = z
  .string()
  .transform(cleanCustomNote)
  .refine((s) => s.length <= MAX_CUSTOM_NOTE, { message: "custom note too long" });

/** F38: the inscription on the form path — same cleaner as the note, tighter
 *  cap. Over-cap → payload rejected (400), like customNoteSchema. */
const customTextSchema = z
  .string()
  .transform(cleanCustomNote)
  .refine((s) => s.length <= MAX_CUSTOM_TEXT, { message: "custom text too long" });

/** One cart line as it travels to the server (snapshots are rebuilt server-side
 *  from these trusted-by-shape fields; prices stay cents+currency, never float). */
export const orderItemSchema = z.object({
  supplierId: z.string().uuid(),
  supplierName: z.string().min(1),
  productId: z.string().uuid().nullable(),
  productName: z.string().min(1),
  unitPriceCents: z.number().int().nonnegative(),
  currency: z.enum(CURRENCIES),
  quantity: z.number().int().positive(),
  configCode: z.string().min(1),
  // The snapshot is trusted-by-shape EXCEPT the free-text note and inscription,
  // which are sanitised + length-checked here (AC7, F38). passthrough keeps
  // the other fields.
  configSnapshot: z
    .object({
      customNote: customNoteSchema.optional(),
      customText: customTextSchema.optional(),
    })
    .passthrough()
    .nullable(),
  /** F30: lets the customer email build the CA-3 "reopen your set" link.
   *  Optional + not persisted (no order_items column) — absent rows just drop
   *  out of the set link. */
  productSlug: z.string().optional(),
});

export type OrderItemInput = z.infer<typeof orderItemSchema>;

/** The customer-facing form fields (also validated client-side). */
export const orderFormSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  // Shipping address (pre-launch). OPTIONAL for now — the "mandatory" rule is
  // pending the client's confirmation; only the max length is enforced.
  address: z.string().trim().max(200).optional().or(z.literal("")),
  zipcode: z.string().trim().max(20).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type OrderFormInput = z.infer<typeof orderFormSchema>;

/** Full POST /api/orders body. */
export const orderPayloadSchema = orderFormSchema.extend({
  locale: z.enum(["no", "en"]),
  turnstileToken: z.string().min(1),
  items: z.array(orderItemSchema).min(1),
});

export type OrderPayload = z.infer<typeof orderPayloadSchema>;
