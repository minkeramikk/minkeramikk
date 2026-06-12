import { AdminShell } from "@/components/shell/admin-shell";
import { getFeaturedConfigsFresh } from "@/lib/catalog/featured";
import { MAX_FEATURED } from "@/lib/catalog/featured-constants";
import { FeaturedAddForm } from "@/components/admin/featured-add-form";
import { FeaturedRowActions } from "@/components/admin/featured-row-actions";
import { assetUrl } from "@/lib/storage";

// Live data: curation changes must show at once (the public strip is cached
// under the `featured` tag instead).
export const dynamic = "force-dynamic";

export default async function AdminFeaturedPage() {
  // fresh read on purpose: curation sees the DB truth, the cached variant
  // is for the public strip only
  const rows = await getFeaturedConfigsFresh();
  const full = rows.length >= MAX_FEATURED;

  return (
    <AdminShell
      active="/admin/featured"
      title="Featured designs"
      action={
        <span
          data-testid="featured-counter"
          className="text-sm tabular-nums text-muted-foreground"
        >
          {rows.length}/{MAX_FEATURED}
        </span>
      }
    >
      <div data-testid="admin-featured" className="flex flex-col gap-5">
        <FeaturedAddForm full={full} />

        {rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Nothing featured yet — paste a config code or an app link above.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Order</th>
                  <th className="px-3 py-2.5 font-medium">Preview</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Label</th>
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell">
                    Payload
                  </th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={row.id}
                    data-testid="featured-row"
                    className={`border-b border-border/50 last:border-0 ${row.valid ? "" : "opacity-60"}`}
                  >
                    <td className="px-3 py-2.5">
                      <FeaturedRowActions
                        id={row.id}
                        isFirst={i === 0}
                        isLast={i === rows.length - 1}
                        labelNo={row.labelNo}
                        labelEn={row.labelEn}
                        mode="move"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element -- pre-composed thumb from storage */}
                      <img
                        src={assetUrl(row.thumbImage)}
                        alt=""
                        className="size-12 rounded-md border border-border bg-card object-contain"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase ${
                          row.kind === "set"
                            ? "bg-ink text-ink-foreground"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {row.kind}
                      </span>
                      {row.kind === "set" && row.setCount != null && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          · {row.setCount} pcs
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <FeaturedRowActions
                        id={row.id}
                        isFirst={i === 0}
                        isLast={i === rows.length - 1}
                        labelNo={row.labelNo}
                        labelEn={row.labelEn}
                        mode="label"
                      />
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.designName ?? "—"}
                      </p>
                      {!row.valid && (
                        <p
                          data-testid="featured-invalid"
                          className="mt-1 text-xs font-medium text-destructive"
                        >
                          ⚠ invalid — {row.reason} (hidden from the home)
                        </p>
                      )}
                    </td>
                    <td className="hidden max-w-[220px] truncate px-3 py-2.5 font-mono text-xs text-muted-foreground md:table-cell">
                      {row.payload}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <FeaturedRowActions
                        id={row.id}
                        isFirst={i === 0}
                        isLast={i === rows.length - 1}
                        labelNo={row.labelNo}
                        labelEn={row.labelEn}
                        mode="delete"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          The card image is composed when you save the entry — if you later
          change a design&apos;s assets, remove and re-add the featured entry
          to refresh it.
        </p>
      </div>
    </AdminShell>
  );
}
