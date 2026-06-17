import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveDesigns } from "@/lib/catalog/designs";
import { getDesignDetail } from "@/lib/catalog/design-options";
import { toCodecDesign, type CodecDesign } from "@/lib/configurator/config-code";
import { mapOrderRow, type AdminOrder, type RawOrderRow } from "./admin-orders";

/**
 * Server fetchers for the admin orders module (F07). Everything goes through the
 * cookie-session `createClient()` (anon key + RLS): only an authenticated admin
 * reads orders (RLS 0002). The service-role key is never used here.
 */
const ORDER_SELECT =
  "id, code, customer_name, email, phone, message, locale, status, internal_notes, created_at, updated_at, " +
  "order_items ( id, supplier_id, supplier_name_snapshot, product_name_snapshot, price_cents_snapshot, currency_snapshot, quantity, config_code, config_snapshot, product_id, products ( image ) )";

export async function listOrders(): Promise<AdminOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return (data as unknown as RawOrderRow[]).map(mapOrderRow);
}

export async function getOrder(id: string): Promise<AdminOrder | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapOrderRow(data as unknown as RawOrderRow);
}

/** Codec designs for decoding line config codes into configurator deep-links.
 *  Active designs only (a code for an inactive design simply won't be clickable). */
export async function getCodecDesigns(): Promise<CodecDesign[]> {
  const designs = await getActiveDesigns();
  const details = await Promise.all(designs.map((d) => getDesignDetail(d.slug)));
  return details
    .map((d) => (d ? toCodecDesign(d) : null))
    .filter((d): d is CodecDesign => d !== null);
}
