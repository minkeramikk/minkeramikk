"use client";

import { useState, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  moveFeatured,
  removeFeatured,
  updateFeaturedLabel,
  type FeaturedFormState,
} from "@/app/admin/featured/actions";

/**
 * F28 — per-row controls for /admin/featured, split by `mode` so each table
 * cell hosts its own small form: arrows (↑↓ swap, audit UX-6 — no numeric
 * inputs), inline label edit, delete with confirm (pattern F07b).
 */
export function FeaturedRowActions({
  id,
  isFirst,
  isLast,
  labelNo,
  labelEn,
  mode,
}: {
  id: string;
  isFirst: boolean;
  isLast: boolean;
  labelNo: string | null;
  labelEn: string | null;
  mode: "move" | "label" | "delete";
}) {
  const [confirming, setConfirming] = useState(false);
  const [delState, delAction, delPending] = useActionState(
    removeFeatured,
    { error: null } as FeaturedFormState
  );

  if (mode === "move") {
    // direction travels via .bind: React does NOT forward the submitter
    // button's name/value to plain form server actions
    return (
      <form className="flex flex-col gap-0.5">
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          formAction={moveFeatured.bind(null, "up")}
          aria-label="Move up"
          data-testid="featured-move-up"
          disabled={isFirst}
          className="flex size-7 items-center justify-center rounded-sm border border-border text-xs hover:border-ring disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="submit"
          formAction={moveFeatured.bind(null, "down")}
          aria-label="Move down"
          data-testid="featured-move-down"
          disabled={isLast}
          className="flex size-7 items-center justify-center rounded-sm border border-border text-xs hover:border-ring disabled:opacity-30"
        >
          ↓
        </button>
      </form>
    );
  }

  if (mode === "label") {
    // one language per row, tagged — side-by-side inputs read as one blob
    return (
      <form
        action={updateFeaturedLabel}
        className="flex flex-col items-start gap-1"
      >
        <input type="hidden" name="id" value={id} />
        <label className="flex items-center gap-1.5">
          <span className="w-6 text-[10px] font-bold uppercase text-muted-foreground">
            NO
          </span>
          <Input
            name="labelNo"
            defaultValue={labelNo ?? ""}
            placeholder="Norwegian label (optional)"
            aria-label="Label NO"
            maxLength={80}
            className="h-8 w-44 text-xs"
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="w-6 text-[10px] font-bold uppercase text-muted-foreground">
            EN
          </span>
          <Input
            name="labelEn"
            defaultValue={labelEn ?? ""}
            placeholder="English label (optional)"
            aria-label="Label EN"
            maxLength={80}
            className="h-8 w-44 text-xs"
          />
        </label>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          data-testid="featured-save-label"
          className="ml-7.5"
        >
          Save
        </Button>
      </form>
    );
  }

  // mode === "delete" — two-stage confirm (F07b)
  return (
    <div className="flex items-center justify-end gap-1.5">
      {confirming ? (
        <>
          <form action={delAction}>
            <input type="hidden" name="id" value={id} />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              data-testid="featured-delete-confirm"
              disabled={delPending}
              className="border-destructive text-destructive"
            >
              {delPending ? "Deleting…" : "Confirm"}
            </Button>
          </form>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="featured-delete"
          aria-label="Delete featured entry"
          onClick={() => setConfirming(true)}
        >
          🗑
        </Button>
      )}
      {delState.error && (
        <p role="alert" className="text-xs text-destructive">
          {delState.error}
        </p>
      )}
    </div>
  );
}
