"use client";

import { useEffect, useRef, useState } from "react";
import { moveItem } from "@/lib/catalog/reorder";

/** Arrows fire fast; coalesce a burst into one save (F39 AC-D2). */
const SAVE_DELAY_MS = 600;

export type ReorderStatus = "idle" | "saving" | "saved" | "error";

/**
 * The F39 reorder engine, lifted out of ProductOrderList so /admin/designs can
 * mount the same behaviour (R-EXTRA): optimistic local order, one coalesced save
 * per gesture, serialised requests, rollback to the last acknowledged order.
 *
 * It owns state and saving only — no markup: the two lists render a card and a
 * table row respectively. `dragProps` hands back the HTML5 DnD wiring; the
 * caller styles the drop edge from `dropEdge`.
 *
 * @param serverRows rows in server order; they win whenever the page re-renders
 *                   and nothing local is pending. Pass a STABLE array (props,
 *                   not a fresh map()): it is the sync effect's dependency.
 * @param save       server action receiving the full ordered id list
 * @param label      row name, for the aria-label and the move announcement
 */
export function useReorder<T extends { id: string }>(
  serverRows: T[],
  save: (ids: string[]) => Promise<{ error: string | null }>,
  label: (row: T) => string
) {
  const [rows, setRows] = useState(serverRows);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [status, setStatus] = useState<ReorderStatus>("idle");
  // Announced move ("Kopp moved to position 2 of 5") — an arrow click has to be
  // perceivable without sight, and the Saving/Saved text alone does not say
  // WHAT moved or where it landed.
  const [announce, setAnnounce] = useState("");

  // The last order the server acknowledged — the rollback target (AC-D4).
  const saved = useRef(serverRows);
  const dirty = useRef(false);
  // Bumped by every gesture. A save's continuation only owns the state if the
  // generation it was scheduled under is still the current one — otherwise a
  // request that resolves late would clear `dirty` on behalf of a NEWER gesture,
  // letting the sync effect below overwrite it and cancel its pending save.
  const gen = useRef(0);
  // Saves run one at a time: two overlapping calls send two legal permutations,
  // but they can commit in either order and persist the older arrangement.
  const chain = useRef<Promise<void>>(Promise.resolve());
  // The action identity can change between renders (it does not today, but the
  // save effect must not re-fire on it) — keep it in a ref.
  const saveRef = useRef(save);
  saveRef.current = save;

  // Server data wins whenever the page re-renders with a fresh order.
  useEffect(() => {
    if (!dirty.current) {
      setRows(serverRows);
      saved.current = serverRows;
    }
  }, [serverRows]);

  function reorder(from: number, to: number) {
    if (from === to) return;
    dirty.current = true;
    gen.current += 1;
    setStatus("saving");
    const moved = rows[from];
    if (moved) setAnnounce(`${label(moved)} moved to position ${to + 1} of ${rows.length}`);
    setRows((r) => moveItem(r, from, to));
  }

  // One debounced save per gesture: a drop, or the tail of an arrow burst.
  useEffect(() => {
    if (!dirty.current) return;
    const myGen = gen.current;
    const sending = rows; // freeze the payload: `rows` must not drift under us
    const t = setTimeout(() => {
      const send = async () => {
        const { error } = await saveRef
          .current(sending.map((r) => r.id))
          .catch(() => ({ error: "Could not save the new order." }));
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
  }, [rows]);

  const dragIndex = dragId ? rows.findIndex((r) => r.id === dragId) : -1;

  /** HTML5 drag wiring for the row at `i`, plus where to draw the drop edge. */
  function dragProps(row: T, i: number) {
    // The indicator sits on the edge the row will actually land on: a downward
    // drag inserts AFTER the target, an upward one before.
    const dropEdge: "top" | "bottom" | null =
      overId === row.id ? (dragIndex > -1 && dragIndex < i ? "bottom" : "top") : null;
    return {
      draggable: true,
      "aria-label": `${label(row)}, position ${i + 1} of ${rows.length}`,
      dragging: dragId === row.id,
      dropEdge,
      onDragStart: (e: React.DragEvent) => {
        setDragId(row.id);
        e.dataTransfer.effectAllowed = "move";
        // Firefox refuses to start a drag without payload.
        e.dataTransfer.setData("text/plain", row.id);
      },
      onDragEnd: () => {
        setDragId(null);
        setOverId(null);
      },
      onDragOver: (e: React.DragEvent) => {
        // Only rows of THIS list are drop targets — the list a row can land in
        // is the only list it was rendered into (AC-D3).
        if (!dragId || dragId === row.id) return;
        e.preventDefault();
        setOverId(row.id);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (!dragId) return;
        const from = rows.findIndex((r) => r.id === dragId);
        const to = rows.findIndex((r) => r.id === row.id);
        setDragId(null);
        setOverId(null);
        if (from === -1 || to === -1) return;
        reorder(from, to);
      },
    };
  }

  return { rows, status, announce, reorder, dragProps };
}
