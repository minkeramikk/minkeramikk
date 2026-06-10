"use client";

import { useState, useActionState } from "react";
import { deleteDesign } from "@/app/admin/designs/actions";
import { Button } from "@/components/ui/button";

/**
 * Delete a design, behind an inline confirmation (so test designs can be removed
 * without an accidental click). Wires the existing `deleteDesign` server action
 * (CASCADE on categories/options; orders keep their snapshots). On success the
 * action redirects to the designs list.
 */
export function DeleteDesignButton({
  designId,
  designName,
}: {
  designId: string;
  designName: string;
}) {
  const [state, del, deleting] = useActionState(deleteDesign, { error: null });
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      data-testid="delete-design"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
    >
      <p className="text-sm font-medium">Delete this design</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Removes the design and all its categories &amp; options. Existing orders
        keep their snapshots. This cannot be undone.
      </p>

      {confirming ? (
        <form action={del} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={designId} />
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={deleting}
            data-testid="delete-design-confirm"
          >
            {deleting ? "Deleting…" : `Yes, delete “${designName}”`}
          </Button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 text-destructive"
          onClick={() => setConfirming(true)}
          data-testid="delete-design-trigger"
        >
          Delete design
        </Button>
      )}

      {state.error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {state.error}
        </p>
      )}
    </div>
  );
}
