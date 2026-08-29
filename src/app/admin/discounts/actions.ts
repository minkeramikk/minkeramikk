"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { getAdminUser } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import type { PickerState } from "@/components/admin/product-multi-select";
import { suggestedSharesSupplier } from "@/lib/discounts/discount";

// R4-SCONTI Task 7 — admin controls for the quantity-discount scale (ADR 0022).
// Same pattern as saveDesignProducts (src/app/admin/designs/actions.ts:717):
// zod on every input, the cookie-session client (RLS applies, never the
// service role), getAdminUser() as defense in depth, an atomic replace
// through the RPC from migration 0032.

export type ActionResult = { error?: string; notice?: string; id?: string };

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

// R4-SCONTI Task 14 — the Automations panel (ADR 0023): the shop owner authors
// upsell rules themselves, so every duty below is feedback a solo admin needs
// at save time, not documentation.

/** C2 — an empty/absent percentage is NULL, not 0. z.coerce.number() would
 *  otherwise coerce "" (the input is disabled and cleared for `inherited`/
 *  `none`, Task 14 step 2) to 0, and min(1) would then reject every non-fixed
 *  rule with an error about a field the admin cannot even type into.
 *  `.int()` IS kept (review round 1, Important 1): silently turning an
 *  admin's "7.5" into 8 changes a commercial decision without telling them,
 *  and the column is `int` — a fractional percentage is not a legitimate
 *  value, so it is REFUSED here, not rounded. `Math.round` below stays as
 *  belt-and-braces against the same int-column trap build.ts:50-54 guards
 *  against (SQLSTATE 22P02) — defence in depth, not the primary guard. */
const pctField = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce
    .number({ error: "Enter a percentage." })
    .int({ error: "The percentage must be a whole number." })
    .min(1, { error: "The percentage must be at least 1%." })
    .max(90, { error: "The percentage cannot exceed 90%." })
    .nullable()
);

const ruleSchema = z
  .object({
    id: z.string().uuid().optional().or(z.literal("")),
    name: z
      .string()
      .trim()
      .min(1, { error: "Give the rule a name." })
      .max(80, { error: "Keep the name under 80 characters." }),
    enabled: z.boolean(),
    triggerMinQty: z.coerce
      .number({ error: "Enter a trigger quantity." })
      .int({ error: "The trigger quantity must be a whole number." })
      .min(1, { error: "The trigger quantity must be at least 1." })
      .max(999, { error: "The trigger quantity is too high." }),
    // no rows = a rule with nothing that can ever trigger it — refuse, not
    // "all products" (unlike discount_products' ADR 0017 convention: that
    // convention is for an OPT-OUT list, this is an opt-IN trigger group).
    triggerProductIds: z
      .array(z.string().uuid())
      .min(1, { error: "Pick at least one product for the trigger group." }),
    suggestedProductId: z.string().uuid({ error: "Choose a product to suggest." }),
    suggestedQty: z.coerce
      .number({ error: "Enter a suggested quantity." })
      .int({ error: "The suggested quantity must be a whole number." })
      .min(1, { error: "The suggested quantity must be at least 1." })
      .max(99, { error: "The suggested quantity is too high." }),
    discountMode: z.enum(["fixed", "inherited", "none"], { error: "Choose a discount mode." }),
    discountPct: pctField,
  })
  // «fixed» without a percentage is a rule that silently resolves to a 0% deal
  // in the engine (discount.ts: `rule.discountPct ?? 0`) — looks configured,
  // gives nothing. Refuse it here instead.
  .refine((r) => r.discountMode !== "fixed" || r.discountPct !== null, {
    message: "A fixed deal needs a percentage.",
  })
  // A rule that suggests something already inside its own trigger group can
  // never fire (the suggested product would always be in the cart, ADR 0023 (d)).
  .refine((r) => !r.triggerProductIds.includes(r.suggestedProductId), {
    message: "The suggested ceramic cannot be part of its own trigger group.",
  });

const CROSS_SUPPLIER_ERROR =
  "The suggested ceramic must share a supplier with at least one product in the trigger group — the suggested line inherits the trigger's design, which means nothing across suppliers.";

export async function saveDiscountRule(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  if (!(await getAdminUser())) return { error: "Not authorized." };

  let triggerProductIds: unknown;
  try {
    triggerProductIds = JSON.parse(String(formData.get("triggerProductIds") ?? "[]"));
  } catch {
    return { error: "Invalid selection." };
  }

  const parsed = ruleSchema.safeParse({
    id: formData.get("id") ?? "",
    name: formData.get("name"),
    enabled: formData.get("enabled") === "on",
    triggerMinQty: formData.get("triggerMinQty"),
    triggerProductIds,
    suggestedProductId: formData.get("suggestedProductId"),
    suggestedQty: formData.get("suggestedQty"),
    discountMode: formData.get("discountMode"),
    discountPct: formData.get("discountPct"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid rule." };
  }

  // Normalise the mode's own field: a percentage left over from an earlier
  // `fixed` state cannot linger on a rule that no longer uses one.
  const discountPct = parsed.data.discountMode === "fixed" ? parsed.data.discountPct : null;
  // Belt-and-braces (see pctField's comment above): the column is `int` and a
  // bare TS `number` is not a promise it already is one.
  const roundedPct = discountPct === null ? null : Math.round(discountPct);

  const supabase = await createClient();

  // Duty 4, enforced server-side (review round 1, Important 5): never trust
  // the browser for a business rule. One query for every submitted product id.
  const productIds = Array.from(
    new Set([...parsed.data.triggerProductIds, parsed.data.suggestedProductId])
  );
  const { data: productRows, error: productErr } = await supabase
    .from("products")
    .select("id, supplier_id")
    .in("id", productIds);
  if (productErr) return { error: "Could not verify the selected products." };

  const supplierById = new Map((productRows ?? []).map((p) => [p.id, p.supplier_id]));
  const triggerSupplierIds = parsed.data.triggerProductIds
    .map((id) => supplierById.get(id))
    .filter((s): s is string => Boolean(s));
  const suggestedSupplierId = supplierById.get(parsed.data.suggestedProductId);
  if (!suggestedSharesSupplier(triggerSupplierIds, suggestedSupplierId)) {
    return { error: CROSS_SUPPLIER_ERROR };
  }

  const row = {
    name: parsed.data.name,
    enabled: parsed.data.enabled,
    trigger_min_qty: parsed.data.triggerMinQty,
    suggested_product_id: parsed.data.suggestedProductId,
    suggested_qty: parsed.data.suggestedQty,
    discount_mode: parsed.data.discountMode,
    discount_pct: roundedPct,
  };

  const existingId = parsed.data.id || undefined;
  let saved: { id: string } | null;
  let error: { message: string } | null;
  if (existingId) {
    ({ data: saved, error } = await supabase
      .from("discount_rules")
      .update(row)
      .eq("id", existingId)
      .select("id")
      .single());
  } else {
    // Duty (Important 4): every new rule lands on sort_order 0 by default —
    // with 2+ rules that's an arbitrary heap-order tie, and discount.ts:151
    // documents "the first matching rule in the admin's own order wins".
    // max(sort_order) + 1 keeps new rules deterministically last.
    const { data: maxRow } = await supabase
      .from("discount_rules")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    ({ data: saved, error } = await supabase
      .from("discount_rules")
      .insert({ ...row, sort_order: (maxRow?.sort_order ?? -1) + 1 })
      .select("id")
      .single());
  }
  if (error || !saved) return { error: "Could not save the rule." };

  // Revalidate as soon as the rule ITSELF is committed (Task 7 pattern: before
  // a second write that might still fail) — if the trigger-group replace below
  // fails, the DB rolls that step back to what it had (never worse than before),
  // so the public cache must not keep serving the pre-save rule indefinitely.
  revalidateTag("catalog"); // public config cache (Task 3)

  const { error: linkErr } = await supabase.rpc("replace_discount_rule_products", {
    p_rule_id: saved.id,
    p_product_ids: parsed.data.triggerProductIds,
  });
  if (linkErr) return { error: "The rule was saved but its trigger group was not.", id: saved.id };

  revalidatePath("/admin/discounts");
  return { notice: "Saved.", id: saved.id };
}

const idSchema = z.string().uuid();

export async function deleteDiscountRule(formData: FormData): Promise<ActionResult> {
  if (!(await getAdminUser())) return { error: "Not authorized." };

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { error: "Invalid rule." };

  const supabase = await createClient();
  // discount_rule_products cascades (migration 0034: on delete cascade).
  const { error } = await supabase.from("discount_rules").delete().eq("id", id.data);
  if (error) return { error: "Could not delete the rule." };

  revalidateTag("catalog"); // public config cache (Task 3)
  revalidatePath("/admin/discounts");
  return { notice: "Deleted." };
}

export async function toggleAutomations(formData: FormData): Promise<ActionResult> {
  if (!(await getAdminUser())) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({ automations_enabled: formData.get("enabled") === "on" })
    .eq("id", 1);
  if (error) return { error: "Could not save the switch." };

  revalidateTag("catalog"); // public config cache (Task 3)
  revalidatePath("/admin/discounts");
  return { notice: "Saved." };
}
