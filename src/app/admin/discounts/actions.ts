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
 *  No `.int()` here (unlike the tiers' pctField above): a fractional entry is
 *  ROUNDED before the write below, mirroring build.ts's Math.round guard for
 *  the exact same int-column trap (src/lib/orders/build.ts:50-54), rather than
 *  rejected — the DB is the source of truth, not the admin's typing precision. */
const pctField = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce.number().min(1).max(90).nullable()
);

const ruleSchema = z
  .object({
    id: z.string().uuid().optional().or(z.literal("")),
    name: z.string().trim().min(1).max(80),
    enabled: z.boolean(),
    triggerMinQty: z.coerce.number().int().min(1).max(999),
    // no rows = a rule with nothing that can ever trigger it — refuse, not
    // "all products" (unlike discount_products' ADR 0017 convention: that
    // convention is for an OPT-OUT list, this is an opt-IN trigger group).
    triggerProductIds: z.array(z.string().uuid()).min(1),
    suggestedProductId: z.string().uuid(),
    suggestedQty: z.coerce.number().int().min(1).max(99),
    discountMode: z.enum(["fixed", "inherited", "none"]),
    discountPct: pctField,
    // Duty 4 — supplier ids the admin's browser already knows (it rendered the
    // picker from the same product list), submitted alongside the product ids
    // so this refusal is pure logic that returns before createClient() is ever
    // called, same trust boundary as the product ids themselves.
    triggerSupplierIds: z.array(z.string().uuid()).min(1),
    suggestedSupplierId: z.string().uuid(),
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
  })
  // ADR 0023 (e): the suggested line inherits the triggering line's
  // configCode, which means nothing across suppliers. A suggested product
  // that shares no supplier with the trigger group is not incorrect — it can
  // simply never fire. Refuse it rather than ship a silently inert rule.
  .refine((r) => r.triggerSupplierIds.includes(r.suggestedSupplierId), {
    message:
      "The suggested ceramic must share a supplier with at least one product in the trigger group — the suggested line inherits the trigger's design, which means nothing across suppliers.",
  });

export async function saveDiscountRule(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  if (!(await getAdminUser())) return { error: "Not authorized." };

  let triggerProductIds: unknown;
  let triggerSupplierIds: unknown;
  try {
    triggerProductIds = JSON.parse(String(formData.get("triggerProductIds") ?? "[]"));
    triggerSupplierIds = JSON.parse(String(formData.get("triggerSupplierIds") ?? "[]"));
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
    triggerSupplierIds,
    suggestedSupplierId: formData.get("suggestedSupplierId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid rule." };
  }

  // Normalise the mode's own field, THEN round: a percentage left over from an
  // earlier `fixed` state cannot linger on a rule that no longer uses one, and
  // discount_rules.discount_pct is an `int` column with no cast-side rounding
  // (same 22P02 trap build.ts:50-54 already guards against — the admin's "15.6"
  // is a shop-floor number, not a promise the DB can store as typed).
  const discountPct =
    parsed.data.discountMode === "fixed" && parsed.data.discountPct !== null
      ? Math.round(parsed.data.discountPct)
      : null;

  const supabase = await createClient();
  const row = {
    name: parsed.data.name,
    enabled: parsed.data.enabled,
    trigger_min_qty: parsed.data.triggerMinQty,
    suggested_product_id: parsed.data.suggestedProductId,
    suggested_qty: parsed.data.suggestedQty,
    discount_mode: parsed.data.discountMode,
    discount_pct: discountPct,
  };

  const existingId = parsed.data.id || undefined;
  const { data: saved, error } = existingId
    ? await supabase.from("discount_rules").update(row).eq("id", existingId).select("id").single()
    : await supabase.from("discount_rules").insert(row).select("id").single();
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
