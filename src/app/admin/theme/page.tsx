import { AdminShell } from "@/components/shell/admin-shell";
import { getThemeTokens } from "@/lib/theme.server";
import { ThemeEditor } from "./theme-editor";

// Reads the live tokens per request so a save is reflected immediately.
export const dynamic = "force-dynamic";

export default async function AdminThemePage() {
  const theme = await getThemeTokens();
  return (
    <AdminShell active="/admin/theme" title="Theme">
      <ThemeEditor initial={theme} />
    </AdminShell>
  );
}
