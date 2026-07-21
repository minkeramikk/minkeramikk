"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useReorder } from "@/components/admin/use-reorder";
import { ReorderControls, ReorderStatus } from "@/components/admin/reorder-controls";
import {
  reorderProducts,
  toggleProductVisible,
  deleteProductById,
  deleteAllProductsForSupplier,
} from "@/app/admin/products/actions";

export interface OrderRow {
  id: string;
  nameNo: string;
  supplierId: string;
  price: string;
  visible: boolean;
  pieces: number;
}

export interface SupplierGroup {
  supplierId: string;
  supplierName: string;
  rows: OrderRow[];
}

export function ProductOrderList({ group }: { group: SupplierGroup }) {
  // The whole drag/save/rollback engine lives in useReorder (shared with the
  // designs list); this component only renders rows and the product-only bits.
  const { rows, status, announce, reorder, dragProps } = useReorder(
    group.rows,
    (ids) => reorderProducts(group.supplierId, ids),
    (r) => r.nameNo
  );


  // Delete asks twice, in place. No window.confirm(): a modal dialog blocks the
  // page for anything driving the browser, and the second click is enough.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  function runDelete(id: string) {
    setConfirming(null);
    setDeleteError(null);
    startDelete(async () => {
      const { error } = await deleteProductById(id);
      if (error) setDeleteError(error);
      // No local splice: the action revalidates the page and the sync effect
      // above adopts the server's list — one source of truth for what exists.
    });
  }

  function runDeleteAll() {
    setConfirming(null);
    setDeleteError(null);
    startDelete(async () => {
      const { error } = await deleteAllProductsForSupplier(group.supplierId);
      if (error) setDeleteError(error);
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium" data-testid="product-group-supplier">
            {group.supplierName}
          </h2>
          {confirming === "all" ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-destructive">
                Delete all {rows.length} ceramics of {group.supplierName}?
              </span>
              <button
                type="button"
                onClick={runDeleteAll}
                disabled={deleting}
                data-testid="product-delete-all-confirm"
                className="rounded-sm bg-destructive px-2 py-1 font-medium text-destructive-foreground"
              >
                Yes, delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                data-testid="product-delete-cancel"
                className="rounded-sm border border-border px-2 py-1"
              >
                Cancel
              </button>
            </span>
          ) : (
            rows.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirming("all")}
                disabled={deleting}
                data-testid="product-delete-all"
                className="rounded-sm border border-border px-2 py-1 text-xs text-destructive"
              >
                Delete all
              </button>
            )
          )}
        </div>
        <ReorderStatus status={status} announce={announce} testidPrefix="product">
          {deleteError && (
            <span className="text-destructive" data-testid="product-delete-error">
              {deleteError}
            </span>
          )}
        </ReorderStatus>
      </div>

      <ul
        className="divide-y divide-border/50"
        data-testid="product-group"
        data-supplier={group.supplierId}
      >
        {rows.map((p, i) => {
          const { dragging, dropEdge, ...drag } = dragProps(p, i);
          return (
          <li
            key={p.id}
            data-testid="product-row"
            {...drag}
            className={[
              "flex items-center gap-3 bg-card px-4 py-3 text-sm",
              // motion-reduce drops the lift; the drop indicator stays, since a
              // border is information, not decoration.
              "transition-shadow motion-reduce:transition-none",
              dragging ? "opacity-60 shadow-lg motion-reduce:shadow-none" : "",
              dropEdge === "bottom" ? "border-b-2 border-b-primary" : "",
              dropEdge === "top" ? "border-t-2 border-t-primary" : "",
            ].join(" ")}
          >
            <ReorderControls
              index={i}
              count={rows.length}
              label={p.nameNo}
              onMove={reorder}
              testidPrefix="product"
            />

            <span className="min-w-0 flex-1 font-medium">
              <span className="truncate">{p.nameNo}</span>
              {p.pieces > 1 && (
                <span
                  data-testid="product-set-chip"
                  className="ml-2 rounded-full bg-ink px-2 py-0.5 align-middle text-[10px] font-bold uppercase text-ink-foreground"
                >
                  Set · {p.pieces}
                </span>
              )}
            </span>

            <span className="tabular-nums text-muted-foreground">{p.price}</span>

            <form action={toggleProductVisible}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="visible" value={p.visible ? "false" : "true"} />
              <button
                type="submit"
                data-testid="product-toggle-visible"
                className="text-sm underline-offset-2 hover:underline"
              >
                {p.visible ? "Yes" : "No"}
              </button>
            </form>

            <Link
              href={`/admin/products/${p.id}`}
              data-testid="product-edit"
              className="text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              Edit
            </Link>

            {confirming === p.id ? (
              <span className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => runDelete(p.id)}
                  disabled={deleting}
                  data-testid="product-delete-confirm"
                  className="rounded-sm bg-destructive px-2 py-1 font-medium text-destructive-foreground"
                >
                  Delete?
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  data-testid="product-delete-cancel"
                  className="rounded-sm border border-border px-2 py-1"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(p.id)}
                disabled={deleting}
                aria-label={`Delete ${p.nameNo}`}
                data-testid="product-delete"
                className="text-sm text-destructive underline-offset-2 hover:underline"
              >
                Delete
              </button>
            )}
          </li>
          );
        })}
      </ul>
    </div>
  );
}
