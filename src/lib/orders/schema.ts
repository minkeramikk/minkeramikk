/**
 * Order payload schema (F05) — shared by the client form and the server route,
 * so validation is identical on both sides. Pure zod, no React/DB.
 */
import { z } from "zod";
import { CURRENCIES } from "@/lib/money/money";

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
  configSnapshot: z.unknown().nullable(),
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
