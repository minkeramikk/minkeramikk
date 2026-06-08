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
});

export type OrderItemInput = z.infer<typeof orderItemSchema>;

/** The customer-facing form fields (also validated client-side). */
export const orderFormSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
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
