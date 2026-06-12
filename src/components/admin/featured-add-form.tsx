"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addFeatured,
  previewFeatured,
  type FeaturedFormState,
} from "@/app/admin/featured/actions";

const initial: FeaturedFormState = { error: null, preview: null };

/**
 * F28 — single "paste a code or a link" input with auto-detect. Two-step:
 * Preview resolves the payload server-side and shows WHAT would go in the
 * shop window (set: first-row composition + the row list), then Add saves
 * with the pre-composed thumb. The stacked-layers preview here is admin-only
 * — the public home always gets the single composed image (ADR 0016).
 */
export function FeaturedAddForm({ full }: { full: boolean }) {
  const [state, formAction, pending] = useActionState(
    async (prev: FeaturedFormState, formData: FormData) => {
      const intent = formData.get("intent");
      return intent === "add"
        ? addFeatured(prev, formData)
        : previewFeatured(prev, formData);
    },
    initial
  );
  const preview = state.preview;

  return (
    <form
      action={formAction}
      data-testid="featured-add-form"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-60 flex-1 text-xs text-muted-foreground">
          Config code or app link
          <Input
            name="input"
            placeholder="MK-… or the Copy link / Share this set URL"
            data-testid="featured-input"
            className="mt-1 font-mono"
            disabled={full}
          />
        </label>
        <Button
          type="submit"
          name="intent"
          value="preview"
          variant="outline"
          data-testid="featured-preview-btn"
          disabled={pending || full}
        >
          Preview
        </Button>
      </div>

      {full && (
        <p className="text-xs text-muted-foreground">
          The shop window is full — remove an entry to add a new one.
        </p>
      )}

      {state.error && (
        <p
          role="alert"
          data-testid="featured-error"
          className="text-sm text-destructive"
        >
          {state.error}
        </p>
      )}

      {preview && (
        <div
          data-testid="featured-preview"
          className="flex flex-wrap items-start gap-4 rounded-md border border-primary/40 bg-primary/5 p-3"
        >
          {/* React 19 resets the form after the preview action — the Add
              step submits the CANONICAL payload from the preview state, not
              the (now cleared) visible input */}
          <input type="hidden" name="confirmedInput" value={preview.payload} />
          {/* admin-only stacked composition (the saved card gets ONE image) */}
          <span className="relative block size-24 shrink-0 overflow-hidden rounded-md border border-border bg-card">
            {preview.layers.map((l, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- catalog art from storage
              <img
                key={`${l.src}-${i}`}
                src={l.src}
                alt=""
                className="absolute inset-0 size-full object-contain"
                style={l.multiply ? { mixBlendMode: "multiply" } : undefined}
              />
            ))}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span
                className={`mr-2 rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase ${
                  preview.kind === "set"
                    ? "bg-ink text-ink-foreground"
                    : "bg-primary/10 text-primary"
                }`}
              >
                {preview.kind}
              </span>
              <strong>{preview.designName}</strong>
              {preview.setCount != null && (
                <span className="text-muted-foreground">
                  {" "}
                  · {preview.setCount} pcs
                </span>
              )}
            </p>
            {preview.rows.length > 0 && (
              <ul className="mt-1 font-mono text-[11px] text-muted-foreground">
                {preview.rows.map((r, i) => (
                  <li key={i}>
                    {r.code} · {r.productSlug} · ×{r.qty}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted-foreground">
                Label NO (optional)
                <Input name="labelNo" className="mt-1 w-44" maxLength={80} />
              </label>
              <label className="text-xs text-muted-foreground">
                Label EN (optional)
                <Input name="labelEn" className="mt-1 w-44" maxLength={80} />
              </label>
              <Button
                type="submit"
                name="intent"
                value="add"
                data-testid="featured-add-btn"
                disabled={pending}
              >
                {pending ? "Saving…" : "Add to the shop window"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
