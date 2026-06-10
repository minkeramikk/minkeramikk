"use client";

import { useActionState } from "react";
import { duplicateDesign } from "@/app/admin/designs/actions";

/**
 * Clone a design into a fresh draft (assets copied; see `duplicateDesign`).
 * On success the action redirects to the new design's editor.
 *
 * Same tested action, two affordances:
 *  - designs list ("Duplicate", subtle link)
 *  - New-design picker ("Use as starting point", primary button)
 */
export function DuplicateDesignButton({
  designId,
  label = "Duplicate",
  pendingLabel = "Duplicating…",
  testid = "design-duplicate",
  variant = "link",
}: {
  designId: string;
  label?: string;
  pendingLabel?: string;
  testid?: string;
  variant?: "link" | "primary";
}) {
  const [state, dup, pending] = useActionState(duplicateDesign, { error: null });
  const cls =
    variant === "primary"
      ? "h-9 w-full rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
      : "text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50";
  return (
    <form action={dup} className={variant === "primary" ? "block" : "inline"}>
      <input type="hidden" name="id" value={designId} />
      <button type="submit" disabled={pending} data-testid={testid} className={cls}>
        {pending ? pendingLabel : label}
      </button>
      {state.error && (
        <span role="alert" className="ml-2 text-xs text-destructive">
          {state.error}
        </span>
      )}
    </form>
  );
}
