"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ORDER_STATUSES } from "@/lib/orders/order-status";

/**
 * Order mutations (F07). Authenticated only: the cookie-session client goes
 * through RLS (orders "authenticated update", 0002), so anon can't reach these
 * effects. `updated_at` is bumped by the `orders_set_updated_at` trigger.
 */
const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(ORDER_STATUSES),
});

export async function updateOrderStatus(formData: FormData): Promise<void> {
  const parsed = statusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase
    .from("orders")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id);

  revalidatePath(`/admin/orders/${parsed.data.id}`);
  revalidatePath("/admin");
}

const notesSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(5000),
});

export async function updateOrderNotes(formData: FormData): Promise<void> {
  const parsed = notesSchema.safeParse({
    id: formData.get("id"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  await supabase
    .from("orders")
    .update({ internal_notes: parsed.data.notes })
    .eq("id", parsed.data.id);

  revalidatePath(`/admin/orders/${parsed.data.id}`);
}
