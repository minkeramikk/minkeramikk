"use client";

import Link from "next/link";
import { DuplicateDesignButton } from "@/components/admin/duplicate-design-button";
import { useReorder } from "@/components/admin/use-reorder";
import { ReorderControls, ReorderStatus } from "@/components/admin/reorder-controls";
import { reorderDesigns } from "@/app/admin/designs/actions";

export interface DesignRow {
  id: string;
  name: string;
  nameNo: string;
  nameEn: string;
  supplierName: string;
  code: string | null;
  categories: number;
  active: boolean;
}

/**
 * R-EXTRA — the F39 order list on the design catalog: same engine (useReorder),
 * same handle/arrows, rendered as the existing table instead of a card list.
 * The order it saves is the one step 1 of the configurator reads (sort_order).
 */
export function DesignOrderList({ designs }: { designs: DesignRow[] }) {
  const { rows, status, announce, reorder, dragProps } = useReorder(
    designs,
    reorderDesigns,
    (d) => d.name
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-end border-b border-border px-4 py-2">
        <ReorderStatus status={status} announce={announce} testidPrefix="design" />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Order</th>
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Supplier</th>
            <th className="px-4 py-2.5 font-medium">Code</th>
            <th className="px-4 py-2.5 font-medium">Categories</th>
            <th className="px-4 py-2.5 font-medium">Active</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => {
            const { dragging, dropEdge, ...drag } = dragProps(d, i);
            return (
              <tr
                key={d.id}
                data-testid="design-row"
                {...drag}
                className={[
                  "border-b border-border/50 last:border-0 hover:bg-muted/50",
                  // motion-reduce drops the lift; the drop indicator stays, since
                  // a border is information, not decoration.
                  "transition-shadow motion-reduce:transition-none",
                  dragging ? "opacity-60 shadow-lg motion-reduce:shadow-none" : "",
                  dropEdge === "bottom" ? "border-b-2 border-b-primary" : "",
                  dropEdge === "top" ? "border-t-2 border-t-primary" : "",
                ].join(" ")}
              >
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <ReorderControls
                      index={i}
                      count={rows.length}
                      label={d.name}
                      onMove={reorder}
                      testidPrefix="design"
                    />
                  </span>
                </td>
                <td className="px-4 py-3 font-medium">{d.name}</td>
                <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                  {d.supplierName}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{d.code ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">{d.categories}</td>
                <td className="px-4 py-3">
                  <span data-status={d.active ? "active" : "draft"}>
                    {d.active ? "Yes" : "Draft"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <DuplicateDesignButton
                      designId={d.id}
                      designNameNo={d.nameNo}
                      designNameEn={d.nameEn}
                    />
                    <Link
                      href={`/admin/designs/${d.id}`}
                      data-testid="design-edit"
                      className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Edit
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
