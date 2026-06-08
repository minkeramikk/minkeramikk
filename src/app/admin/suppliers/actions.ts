"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SupplierFormState = { error: string | null };

const supplierSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
  active: z.coerce.boolean(),
});

/** Create or update a supplier (F09). Mutations run via the cookie-session
 *  client → RLS `authenticated` (service-role is never used here). */
export async function saveSupplier(
  _prev: SupplierFormState,
  formData: FormData
): Promise<SupplierFormState> {
  const parsed = supplierSchema.safeParse({
    id: formData.get("id") ?? "",
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    notes: formData.get("notes") ?? "",
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { id, name, email, phone, notes, active } = parsed.data;
  const row = {
    name,
    email: email || null,
    phone: phone || null,
    notes: notes || null,
    active,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("suppliers").update(row).eq("id", id)
    : await supabase.from("suppliers").insert(row);

  if (error) return { error: "Could not save the supplier." };

  revalidatePath("/admin/suppliers");
  redirect("/admin/suppliers");
}

/** Delete a supplier. ADR 0007: the FK is ON DELETE RESTRICT, so a supplier that
 *  still owns designs/products/order-items cannot be removed — surface a clear
 *  message suggesting deactivation instead. */
export async function deleteSupplier(
  _prev: SupplierFormState,
  formData: FormData
): Promise<SupplierFormState> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid supplier." };

  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").delete().eq("id", id.data);

  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "This supplier still has products or designs. Set it to inactive instead of deleting it.",
      };
    }
    return { error: "Could not delete the supplier." };
  }

  revalidatePath("/admin/suppliers");
  redirect("/admin/suppliers");
}
