import type { SupabaseClient } from "@supabase/supabase-js";
import { CODE_ALPHABET } from "./config-code";

/**
 * Stable config-code assignment (ADR 0011), shared by the import/backfill script
 * AND the back-office create flows (F10). Works with ANY Supabase client — the
 * service-role one in scripts, or the cookie-session (authenticated) one in
 * server actions (RLS allows authenticated writes to designs/options).
 *
 * Deterministic + idempotent: assigns the next free safe-alphabet code to rows
 * whose code is NULL, in a stable order; existing codes are NEVER recalculated
 * (so `config_code`s already referenced by orders stay valid).
 */

/** Next free code not already used in this scope. One char suffices for the
 *  current catalog (≤31 per scope); falls back to 2-char if a scope grows. */
export function nextCode(used: Set<string>): string {
  for (const c of CODE_ALPHABET) if (!used.has(c)) return c;
  for (const a of CODE_ALPHABET)
    for (const b of CODE_ALPHABET) {
      const c = a + b;
      if (!used.has(c)) return c;
    }
  throw new Error("code space exhausted");
}

export async function assignMissingCodes(
  db: SupabaseClient
): Promise<{ designs: number; options: number }> {
  let designsAssigned = 0;
  let optionsAssigned = 0;

  // ── designs: one globally-unique code (order: sort_order, then slug) ──
  const { data: designs, error: dErr } = await db
    .from("designs")
    .select("id, slug, code, sort_order")
    .order("sort_order", { ascending: true })
    .order("slug", { ascending: true });
  if (dErr) throw dErr;

  const usedDesign = new Set(
    (designs ?? []).map((d) => d.code).filter((c): c is string => Boolean(c))
  );
  for (const d of designs ?? []) {
    if (d.code) continue; // never recalculate
    const code = nextCode(usedDesign);
    usedDesign.add(code);
    const { error } = await db.from("designs").update({ code }).eq("id", d.id);
    if (error) throw error;
    designsAssigned++;
  }

  // ── options: one code per category, unique within it (order: sort_order, id) ──
  const { data: cats, error: cErr } = await db
    .from("option_categories")
    .select("id");
  if (cErr) throw cErr;

  for (const cat of cats ?? []) {
    const { data: opts, error: oErr } = await db
      .from("options")
      .select("id, code, sort_order")
      .eq("category_id", cat.id)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });
    if (oErr) throw oErr;

    const used = new Set(
      (opts ?? []).map((o) => o.code).filter((c): c is string => Boolean(c))
    );
    for (const o of opts ?? []) {
      if (o.code) continue;
      const code = nextCode(used);
      used.add(code);
      const { error } = await db.from("options").update({ code }).eq("id", o.id);
      if (error) throw error;
      optionsAssigned++;
    }
  }

  return { designs: designsAssigned, options: optionsAssigned };
}
