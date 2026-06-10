"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkThemeContrast } from "@/lib/theme-contrast";

/**
 * Save the 3 managed theme tokens (F11a, ADR 0008). Authenticated only: the
 * cookie-session client goes through RLS (settings "authenticated update", 0002);
 * the service-role key is never used here. Zod-validated; the WCAG AA gate is
 * re-checked server-side (defense-in-depth — the client also blocks).
 */
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const schema = z.object({ light: hex, dark: hex, accent: hex });

export type ThemeState = { error: string | null; ok?: boolean };

export async function updateTheme(
  _prev: ThemeState,
  formData: FormData
): Promise<ThemeState> {
  const parsed = schema.safeParse({
    light: formData.get("light"),
    dark: formData.get("dark"),
    accent: formData.get("accent"),
  });
  if (!parsed.success) {
    return { error: "Invalid colour — use 6-digit hex values (e.g. #7d4f9c)." };
  }

  const check = checkThemeContrast(parsed.data);
  if (!check.ok) {
    return {
      error: `Contrast below AA: ${check.failures
        .map((f) => f.label)
        .join("; ")}. Adjust the colours and try again.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({
      color_light: parsed.data.light,
      color_dark: parsed.data.dark,
      color_accent: parsed.data.accent,
    })
    .eq("id", 1);
  if (error) return { error: "Could not save. Please try again." };

  revalidateTag("theme"); // invalidate the cached getThemeTokens (P-5)
  revalidatePath("/", "layout"); // re-theme the whole public site
  revalidatePath("/admin/theme");
  return { error: null, ok: true };
}
