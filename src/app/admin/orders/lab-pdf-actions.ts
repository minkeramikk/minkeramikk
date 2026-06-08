"use server";

import { z } from "zod";
import { getAdminUser } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrder } from "@/lib/orders/admin-orders.server";
import { renderSupplierPdf } from "@/lib/orders/lab-pdf.server";
import { sendLabPdf } from "@/lib/orders/lab-pdf-send";

export type LabSendState = { ok: boolean; message: string | null };

/** Generate the supplier production-order PDF and email it (F08). Skips the send
 *  with a warning when the supplier has no email — the PDF stays downloadable. */
export async function sendSupplierLabPdf(
  _prev: LabSendState,
  formData: FormData
): Promise<LabSendState> {
  const user = await getAdminUser();
  if (!user) return { ok: false, message: "Not authorized." };

  const orderId = z.string().uuid().safeParse(formData.get("orderId"));
  const supplierId = z.string().uuid().safeParse(formData.get("supplierId"));
  if (!orderId.success || !supplierId.success)
    return { ok: false, message: "Invalid request." };

  const order = await getOrder(orderId.data);
  if (!order) return { ok: false, message: "Order not found." };

  const pdf = await renderSupplierPdf(order, supplierId.data);
  if (!pdf) return { ok: false, message: "No items for this supplier." };

  const supabase = await createClient();
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("name, email")
    .eq("id", supplierId.data)
    .maybeSingle();

  const res = await sendLabPdf({
    orderCode: order.code,
    supplierName: supplier?.name ?? "supplier",
    supplierEmail: supplier?.email ?? null,
    pdf,
  });

  return {
    ok: res.sent,
    message: res.sent ? `Sent to ${supplier?.email}.` : res.warning,
  };
}
