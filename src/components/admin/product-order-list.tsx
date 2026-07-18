"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { moveItem } from "@/lib/catalog/reorder";
import { reorderProducts, toggleProductVisible } from "@/app/admin/products/actions";

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

/** Arrows fire fast; coalesce a burst into one save (AC-D2). */
const SAVE_DELAY_MS = 600;

export function ProductOrderList({ group }: { group: SupplierGroup }) {
  const [rows, setRows] = useState(group.rows);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Announced move ("Kopp moved to position 2 of 5") — an arrow click has to be
  // perceivable without sight, and the Saving/Saved text alone does not say
  // WHAT moved or where it landed.
  const [announce, setAnnounce] = useState("");

  // The last order the server acknowledged — the rollback target (AC-D4).
  const saved = useRef(group.rows);
  const dirty = useRef(false);
  // Bumped by every gesture. A save's continuation only owns the state if the
  // generation it was scheduled under is still the current one — otherwise a
  // request that resolves late would clear `dirty` on behalf of a NEWER gesture,
  // letting the sync effect below overwrite it and cancel its pending save.
  const gen = useRef(0);
  // Saves run one at a time: two overlapping calls send two legal permutations,
  // but they can commit in either order and persist the older arrangement.
  const chain = useRef<Promise<void>>(Promise.resolve());

  // Server data wins whenever the page re-renders with a fresh order.
  useEffect(() => {
    if (!dirty.current) {
      setRows(group.rows);
      saved.current = group.rows;
    }
  }, [group.rows]);

  function reorder(from: number, to: number) {
    if (from === to) return;
    dirty.current = true;
    gen.current += 1;
    setStatus("saving");
    setAnnounce(`${rows[from]?.nameNo ?? "Product"} moved to position ${to + 1} of ${rows.length}`);
    setRows((r) => moveItem(r, from, to));
  }

  // One debounced save per gesture: a drop, or the tail of an arrow burst.
  useEffect(() => {
    if (!dirty.current) return;
    const myGen = gen.current;
    const sending = rows; // freeze the payload: `rows` must not drift under us
    const t = setTimeout(() => {
      const send = async () => {
        const { error } = await reorderProducts(
          group.supplierId,
          sending.map((r) => r.id)
        ).catch(() => ({ error: "Could not save the new order." }));
        // A newer gesture owns the list now — touch nothing, its own save is
        // already queued behind this one.
        if (gen.current !== myGen) return;
        dirty.current = false;
        if (error) {
          // Read the acknowledged order HERE, not when the effect ran: an
          // earlier save may have moved it on since.
          setRows(saved.current);
          setStatus("error");
          return;
        }
        saved.current = sending;
        setStatus("saved");
      };
      // `then(send, send)` also recovers the chain if a previous link rejected.
      chain.current = chain.current.then(send, send);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [rows, group.supplierId]);

  const dragIndex = dragId ? rows.findIndex((r) => r.id === dragId) : -1;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-medium" data-testid="product-group-supplier">
          {group.supplierName}
        </h2>
        <span className="text-xs" role="status" aria-live="polite" data-testid="product-order-status">
          {status === "saving" && <span className="text-muted-foreground">Saving…</span>}
          {status === "saved" && <span className="text-[var(--primary)]" data-testid="product-order-saved">Saved ✓</span>}
          {status === "error" && (
            <span className="text-destructive" data-testid="product-order-error">
              Could not save the new order — the list was put back.
            </span>
          )}
          {/* Announced alongside the status, never instead of it. */}
          <span className="sr-only">{announce}</span>
        </span>
      </div>

      <ul
        className="divide-y divide-border/50"
        data-testid="product-group"
        data-supplier={group.supplierId}
      >
        {rows.map((p, i) => (
          <li
            key={p.id}
            data-testid="product-row"
            draggable
            aria-label={`${p.nameNo}, position ${i + 1} of ${rows.length}`}
            onDragStart={(e) => {
              setDragId(p.id);
              e.dataTransfer.effectAllowed = "move";
              // Firefox refuses to start a drag without payload.
              e.dataTransfer.setData("text/plain", p.id);
            }}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
            onDragOver={(e) => {
              // Only rows of THIS group are drop targets — the list a row can
              // land in is the only list it was rendered into (AC-D3).
              if (!dragId || dragId === p.id) return;
              e.preventDefault();
              setOverId(p.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!dragId) return;
              const from = rows.findIndex((r) => r.id === dragId);
              const to = rows.findIndex((r) => r.id === p.id);
              setDragId(null);
              setOverId(null);
              if (from === -1 || to === -1) return;
              reorder(from, to);
            }}
            className={[
              "flex items-center gap-3 bg-card px-4 py-3 text-sm",
              // motion-reduce drops the lift; the drop indicator stays, since a
              // border is information, not decoration.
              "transition-shadow motion-reduce:transition-none",
              dragId === p.id ? "opacity-60 shadow-lg motion-reduce:shadow-none" : "",
              // The indicator sits on the edge the row will actually land on:
              // a downward drag inserts AFTER the target, an upward one before.
              overId === p.id
                ? dragIndex > -1 && dragIndex < i
                  ? "border-b-2 border-b-primary"
                  : "border-t-2 border-t-primary"
                : "",
            ].join(" ")}
          >
            <span
              className="cursor-grab text-muted-foreground active:cursor-grabbing"
              aria-hidden
              data-testid="product-drag-handle"
            >
              <GripVertical className="size-4" />
            </span>

            {/* Keyboard/touch fallback — secondary, but never removed (a11y).
                aria-disabled, not disabled: the row that just reached the top
                disables its own ↑ in the same commit, and a disabled element
                cannot hold focus — the browser would drop the keyboard user to
                <body> exactly when they finish moving an item. 24px box min
                (WCAG 2.2 SC 2.5.8); the icon alone is 14px. */}
            <span className="flex flex-col">
              <button
                type="button"
                aria-disabled={i === 0}
                onClick={() => { if (i > 0) reorder(i, i - 1); }}
                aria-label={`Move ${p.nameNo} up`}
                data-testid="product-move-up"
                className="flex size-6 items-center justify-center rounded-sm text-muted-foreground aria-disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                aria-disabled={i === rows.length - 1}
                onClick={() => { if (i < rows.length - 1) reorder(i, i + 1); }}
                aria-label={`Move ${p.nameNo} down`}
                data-testid="product-move-down"
                className="flex size-6 items-center justify-center rounded-sm text-muted-foreground aria-disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <ChevronDown className="size-3.5" />
              </button>
            </span>

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
          </li>
        ))}
      </ul>
    </div>
  );
}
