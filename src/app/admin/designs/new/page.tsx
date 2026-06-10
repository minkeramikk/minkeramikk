import Link from "next/link";
import { AdminShell } from "@/components/shell/admin-shell";
import { TemplateWizard } from "@/components/admin/template-wizard";
import { DuplicateDesignButton } from "@/components/admin/duplicate-design-button";
import { getActiveDesigns } from "@/lib/catalog/designs";
import { createClient } from "@/lib/supabase/server";
import { assetUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * New design — start from an existing design (clone) so the result is
 * functional out of the box. The chosen design is copied into a fresh draft,
 * assets and all (see `duplicateDesign`), then opened in the editor to rename
 * and tweak. A blank template stays available as a secondary path.
 */
export default async function NewDesignPage() {
  const supabase = await createClient();
  const [{ data: suppliers }, designs] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("active", true)
      .order("name", { ascending: true }),
    getActiveDesigns(),
  ]);

  // Designs that actually compose a preview come first — those are the useful
  // starting points; a layer-less one would clone into another blank design.
  const starters = [...designs].sort(
    (a, b) =>
      Number(b.defaultLayers.length > 0) - Number(a.defaultLayers.length > 0)
  );

  return (
    <AdminShell
      active="/admin/designs"
      title="New design"
      action={
        <Link
          href="/admin/designs"
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          ‹ All designs
        </Link>
      }
    >
      <p className="mb-5 max-w-xl text-sm text-muted-foreground">
        Start from an existing design — it&apos;s copied into a new draft (with
        its own assets) so the preview works right away. Rename it, swap what you
        need, then tick <em>Active</em>. Prefer a blank canvas? See the option at
        the bottom.
      </p>

      {starters.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No designs to start from yet — use a blank template below.
        </p>
      ) : (
        <ul
          data-testid="design-starters"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {starters.map((d) => {
            const composes = d.defaultLayers.length > 0;
            return (
              <li
                key={d.id}
                data-testid="design-starter"
                className="flex flex-col rounded-lg border border-border bg-card p-3"
              >
                <span
                  aria-hidden
                  className="relative mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted"
                >
                  {composes ? (
                    d.defaultLayers.map((l, i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- composited catalog art from storage
                      <img
                        key={`${l.src}-${i}`}
                        src={assetUrl(l.src)}
                        alt=""
                        className="absolute inset-[8%] h-[84%] w-[84%] object-contain"
                        style={
                          l.blend === "multiply"
                            ? { mixBlendMode: "multiply" }
                            : undefined
                        }
                      />
                    ))
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      no preview
                    </span>
                  )}
                </span>
                <p className="truncate text-sm font-medium">{d.name}</p>
                <p className="mb-2 truncate text-xs text-muted-foreground">
                  {d.supplierName ?? "—"}
                </p>
                <div className="mt-auto">
                  <DuplicateDesignButton
                    designId={d.id}
                    label="Use as starting point"
                    pendingLabel="Copying…"
                    testid="start-from-design"
                    variant="primary"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <details
        open
        data-testid="start-blank"
        className="mt-8 max-w-xl rounded-lg border border-border bg-card p-4"
      >
        <summary
          data-testid="start-blank-toggle"
          className="cursor-pointer text-sm font-medium"
        >
          Or start from a blank template
        </summary>
        <p className="mb-4 mt-2 text-xs text-muted-foreground">
          Builds a skeleton from colours / logos. The colour <em>patterns</em>{" "}
          are bespoke art, so the preview stays empty until you upload each
          option&apos;s compositing layer under <em>Edit</em>.
        </p>
        <TemplateWizard suppliers={suppliers ?? []} />
      </details>
    </AdminShell>
  );
}
