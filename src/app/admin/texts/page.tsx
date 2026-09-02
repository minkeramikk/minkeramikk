import { AdminShell } from "@/components/shell/admin-shell";
import { createClient } from "@/lib/supabase/server";
import en from "@/i18n/messages/en.json";
import no from "@/i18n/messages/no.json";
import { editableKeys, flattenMessages, mergeOverrides } from "@/i18n/overrides";
import { TextsEditor, type TextRow } from "./texts-editor";

/**
 * R4-I18N — "Texts": the shop edits the public copy, NO | EN side by side.
 *
 * Live per request (like /admin/theme and /admin/discounts): a save must be
 * visible immediately, not after an ISR window.
 *
 * The overrides are read here with the AUTHENTICATED client and UNCACHED, on
 * purpose — the public site reads them through the anon client behind the
 * `i18n` cache tag. Different read, but the SAME merge: the rows below are
 * built with `mergeOverrides`, so what the editor searches is exactly what the
 * site renders (card NOTE N5).
 */
export const dynamic = "force-dynamic";

export default async function AdminTextsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("i18n_overrides")
    .select("locale, key, value");

  const rowsFor = (locale: "no" | "en") =>
    Object.fromEntries(
      (data ?? [])
        .filter((row) => row.locale === locale)
        .map((row) => [row.key, row.value])
    );
  const overrides = { no: rowsFor("no"), en: rowsFor("en") };

  const effective = {
    no: flattenMessages(mergeOverrides(no, overrides.no)),
    en: flattenMessages(mergeOverrides(en, overrides.en)),
  };

  const rows: TextRow[] = editableKeys(no).map((key) => ({
    key,
    no: effective.no[key],
    en: effective.en[key],
    overridden: key in overrides.no || key in overrides.en,
  }));

  return (
    <AdminShell active="/admin/texts" title="Texts">
      <p className="mb-4 text-sm text-muted-foreground">
        Website texts only. The order emails and the customer PDF are not edited
        here.
      </p>
      {/* Same shape as /admin/discounts before 0034: the page renders and says
          so, instead of failing every save with a confusing message. */}
      {error ? (
        <p
          data-testid="texts-unavailable"
          className="mb-4 rounded-lg border border-border bg-card p-3 text-sm text-destructive"
        >
          Text editing is not available yet — migration 0039 has not been applied to
          this database. The site is serving the texts shipped with the code.
        </p>
      ) : null}
      <TextsEditor rows={rows} disabled={Boolean(error)} />
    </AdminShell>
  );
}
