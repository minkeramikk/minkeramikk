"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { getAdminUser } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import type { PickerState } from "@/components/admin/product-multi-select";

// R4-SCONTI Task 7 — admin controls for the quantity-discount scale (ADR 0022).
// Same pattern as saveDesignProducts (src/app/admin/designs/actions.ts:717):
// zod on every input, the cookie-session client (RLS applies, never the
// service role), getAdminUser() as defense in depth, an atomic replace
// through the RPC from migration 0032.

export type ActionResult = { error?: string; notice?: string };

const tierSchema = z.object({
  min_qty: z.coerce.number().int().min(2).max(999),
  pct: z.coerce.number().int().min(1).max(90),
});

export async function saveDiscountTiers(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  if (!(await getAdminUser())) return { error: "Not authorized." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("tiers") ?? "[]"));
  } catch {
    return { error: "Invalid scale." };
  }
  // .min(1): an empty scale is not "off" — the enabled flag is the off-switch.
  // Deleting every row and clicking Save must not silently wipe the client's
  // contractual scale with no undo.
  const parsed = z.array(tierSchema).min(1).max(10).safeParse(raw);
  if (!parsed.success) {
    return { error: "Each step needs a quantity of at least 2 and a percentage between 1 and 90." };
  }
  // A scale with two rows at the same quantity is ambiguous — refuse it here so
  // the engine never has to arbitrate (it takes the highest match). The DB
  // also has a unique(min_qty) constraint (migration 0032); this is the
  // friendlier error before that one ever fires.
  const qtys = parsed.data.map((t) => t.min_qty);
  if (new Set(qtys).size !== qtys.length) {
    return { error: "Two steps cannot start at the same quantity." };
  }

  const rows = parsed.data
    .slice()
    .sort((a, b) => a.min_qty - b.min_qty)
    .map((t, i) => ({ ...t, sort_order: i }));

  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_discount_tiers", { p_rows: rows });
  if (error) return { error: "Could not save the scale." };

  // Revalidate as soon as the scale itself is committed, BEFORE the settings
  // write below: if that write then fails, the DB already holds the new scale
  // and the public cache must not keep serving the old one indefinitely.
  revalidateTag("catalog"); // public config cache (Task 3)

  const { error: sErr } = await supabase
    .from("settings")
    .update({ quantity_discounts_enabled: formData.get("enabled") === "on" })
    .eq("id", 1);
  if (sErr) return { error: "The scale was saved but the switch was not." };

  revalidatePath("/admin/discounts");
  return { notice: "Saved." };
}

const uuidArraySchema = z.array(z.string().uuid());

export async function saveDiscountProducts(
  _prev: PickerState,
  formData: FormData
): Promise<PickerState> {
  if (!(await getAdminUser())) return { error: "Not authorized." };

  const mode = z.enum(["all", "some"]).safeParse(formData.get("mode"));
  if (!mode.success) return { error: "Invalid input." };

  // "all" == no rows (ADR 0017 convention); parse the picked ids only in "some".
  let wantedIds: string[] = [];
  if (mode.data === "some") {
    let raw: unknown;
    try {
      raw = JSON.parse(String(formData.get("productIds") ?? "[]"));
    } catch {
      return { error: "Invalid selection." };
    }
    const ids = uuidArraySchema.safeParse(raw);
    if (!ids.success) return { error: "Invalid selection." };
    wantedIds = ids.data;
    if (wantedIds.length === 0) {
      return { error: "Select at least one product — or switch back to 'All'." };
    }
  }

  const supabase = await createClient();

  // atomic replace (delete + insert in one transaction, migration 0032)
  const { error } = await supabase.rpc("replace_discount_products", {
    p_product_ids: wantedIds,
  });
  if (error) return { error: "Could not save the product list." };

  // NB: no revalidatePath here, same reasoning as saveDesignProducts — this
  // action renders through the same ProductMultiSelect (controlled checkboxes
  // keyed on their checked state), stays on the page instead of redirecting,
  // and this page is already force-dynamic so a manual reload re-queries.
  revalidateTag("catalog"); // public config cache (Task 3)
  return { error: null, ok: true };
}
