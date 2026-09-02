"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import en from "@/i18n/messages/en.json";
import no from "@/i18n/messages/no.json";
import { flattenMessages, isEditableKey } from "@/i18n/overrides";
import { checkPlaceholders } from "@/i18n/placeholders";

/**
 * R4-I18N — save and reset one text, both languages at once.
 *
 * NO and EN travel together on purpose: NO/EN parity is guarded by the files
 * and by `messages.test.ts`, and the editor must not be able to sidestep it
 * (card NOTE N3). One upsert writes both rows; reset deletes both.
 *
 * Everything here is validated against the FILE original — the perimeter, the
 * key's existence, the ICU placeholders — never against the current override:
 * the contract a text has to honour is the one the code was written for.
 *
 * English-only, like the whole back office (i18n rule 5).
 */
const FILES = { no: flattenMessages(no), en: flattenMessages(en) } as const;

// 50000: plain `text` column, no DB limit — this is a UI sanity cap, not a
// schema constraint. The longest shipped string today is `legal.terms.body`
// at 3175 characters, and that key (a full terms-of-sale document) is exactly
// the one most likely to be pasted in whole; 8000 clipped a real paste with a
// silent-looking failure (finding 1), so the cap now leaves ~15x headroom
// instead of ~2.5x.
const MAX_LENGTH = 50000;

const schema = z.object({
  intent: z.enum(["save", "reset"]),
  key: z.string().min(1).max(200),
  no: z.string().max(MAX_LENGTH),
  en: z.string().max(MAX_LENGTH),
});

export type TextsState = { error: string | null; ok?: boolean; key?: string };

export async function updateText(
  _prev: TextsState,
  formData: FormData
): Promise<TextsState> {
  const parsed = schema.safeParse({
    intent: formData.get("intent"),
    key: formData.get("key"),
    no: formData.get("no") ?? "",
    en: formData.get("en") ?? "",
  });
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((i) => i.code === "too_big");
    // Carries the key even on a schema failure: the editor scopes every
    // error to `state.key === row.key` (texts-editor.tsx), so a keyless
    // error belongs to no row and renders nowhere — the save looks silently
    // discarded (finding 1).
    return {
      error: tooLong
        ? `That text is too long (${MAX_LENGTH.toLocaleString("en-US")} characters max).`
        : "Invalid request.",
      key: String(formData.get("key") ?? ""),
    };
  }
  const { intent, key } = parsed.data;

  // AC4 + no key can be invented: it must be on the whitelist AND already
  // exist, as a string, in BOTH message files.
  if (!isEditableKey(key) || !FILES.no[key] || !FILES.en[key]) {
    return { error: `"${key}" is not editable from here.`, key };
  }

  if (intent === "reset") {
    const supabase = await createClient();
    const { error } = await supabase
      .from("i18n_overrides")
      .delete()
      .eq("key", key)
      .in("locale", ["no", "en"]);
    if (error) return { error: "Could not reset. Please try again.", key };
    revalidateAll();
    return { error: null, ok: true, key };
  }

  const values = { no: parsed.data.no.trim(), en: parsed.data.en.trim() };
  if (!values.no || !values.en) {
    return { error: "Both languages are required — a text is never saved in one language only.", key };
  }

  for (const [locale, label] of [
    ["no", "Norwegian"],
    ["en", "English"],
  ] as const) {
    const check = checkPlaceholders(FILES[locale][key], values[locale]);
    if (!check.ok) return { error: `${label}: ${check.error}`, key };
  }

  // One statement, two rows: there is no "saved the Norwegian only" state.
  const supabase = await createClient();
  const { error } = await supabase.from("i18n_overrides").upsert(
    [
      { locale: "no", key, value: values.no, updated_at: new Date().toISOString() },
      { locale: "en", key, value: values.en, updated_at: new Date().toISOString() },
    ],
    { onConflict: "locale,key" }
  );
  if (error) return { error: "Could not save. Please try again.", key };

  revalidateAll();
  return { error: null, ok: true, key };
}

/** Same pair as `updateTheme` (ADR 0008): the cached read AND the rendered pages. */
function revalidateAll() {
  revalidateTag("i18n");
  revalidatePath("/", "layout");
  revalidatePath("/admin/texts");
}
