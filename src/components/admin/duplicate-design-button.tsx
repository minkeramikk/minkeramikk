"use client";

import { useActionState, useState } from "react";
import { duplicateDesign } from "@/app/admin/designs/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Clone a design into a fresh draft (assets copied; see `duplicateDesign`).
 * On success the action redirects to the new design's editor.
 *
 * R3-VARIE §B: the name is asked HERE, before the copy exists — the slug and the
 * asset folders are derived from it, so they are born right instead of carrying
 * "<name>-copy" in the public URL forever. Pre-filled with "<name> (copy)".
 * In-place confirmation (no modal), same pattern as DeleteDesignButton.
 *
 * Same tested action, two affordances:
 *  - designs list ("Duplicate", subtle link)
 *  - New-design picker ("Use as starting point", primary button)
 */
export function DuplicateDesignButton({
  designId,
  designNameNo,
  designNameEn,
  label = "Duplicate",
  pendingLabel = "Duplicating…",
  testid = "design-duplicate",
  variant = "link",
}: {
  designId: string;
  designNameNo: string;
  designNameEn?: string;
  label?: string;
  pendingLabel?: string;
  testid?: string;
  variant?: "link" | "primary";
}) {
  const [state, dup, pending] = useActionState(duplicateDesign, { error: null });
  const [naming, setNaming] = useState(false);
  const cls =
    variant === "primary"
      ? "h-9 w-full rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
      : "text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50";

  if (!naming) {
    return (
      <span className={variant === "primary" ? "block" : "inline"}>
        <button
          type="button"
          onClick={() => setNaming(true)}
          data-testid={testid}
          className={cls}
        >
          {label}
        </button>
      </span>
    );
  }

  return (
    <form
      action={dup}
      data-testid={`${testid}-form`}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left"
    >
      <input type="hidden" name="id" value={designId} />
      <p className="text-xs text-muted-foreground">
        Name the copy — the public URL (slug) and its image folder come from the
        Norwegian name.
      </p>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`dup-no-${designId}`} className="text-xs">
          Name (NO)
        </Label>
        <Input
          id={`dup-no-${designId}`}
          name="nameNo"
          required
          defaultValue={`${designNameNo} (copy)`}
          data-testid="design-duplicate-name-no"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`dup-en-${designId}`} className="text-xs">
          Name (EN)
        </Label>
        <Input
          id={`dup-en-${designId}`}
          name="nameEn"
          required
          defaultValue={`${designNameEn ?? designNameNo} (copy)`}
          data-testid="design-duplicate-name-en"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={pending}
          data-testid="design-duplicate-confirm"
        >
          {pending ? pendingLabel : "Create copy"}
        </Button>
        <button
          type="button"
          onClick={() => setNaming(false)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      {state.error && (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      )}
    </form>
  );
}
