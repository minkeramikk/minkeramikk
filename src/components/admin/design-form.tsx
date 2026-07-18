"use client";

import { useActionState, useState } from "react";
import { saveDesign, type DesignFormState } from "@/app/admin/designs/actions";
import { assetUrl } from "@/lib/storage";
import { FileThumbInput } from "@/components/admin/file-thumb-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface DesignValues {
  id: string;
  nameNo: string;
  nameEn: string;
  descriptionNo: string | null;
  descriptionEn: string | null;
  descriptionStep2No: string | null;
  descriptionStep2En: string | null;
  supplierId: string;
  slug: string;
  previewImage: string | null;
  sortOrder: number;
  active: boolean;
  acceptsCustomNotes: boolean;
  acceptsCustomText: boolean;
  code: string | null;
}

const initial: DesignFormState = { error: null };

export function DesignForm({
  design,
  suppliers,
}: {
  design?: DesignValues;
  suppliers: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(saveDesign, initial);
  const [slug, setSlug] = useState(design?.slug ?? "");
  const [confirming, setConfirming] = useState(false);
  const slugChanged = Boolean(design) && slug.trim() !== design?.slug;

  return (
    <form
      action={formAction}
      // R3-VARIE §B: a changed slug needs one explicit confirmation — the first
      // submit only opens the panel below (no window.confirm, no type-swapping
      // button: swapping type mid-click submits the form by accident).
      onSubmit={(e) => {
        if (slugChanged && !confirming) {
          e.preventDefault();
          setConfirming(true);
        }
      }}
      className="flex max-w-lg flex-col gap-4"
      data-testid="design-form"
    >
      {design && <input type="hidden" name="id" value={design.id} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nameNo">Name (NO)</Label>
          <Input id="nameNo" name="nameNo" required defaultValue={design?.nameNo ?? ""} data-testid="design-name-no" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nameEn">Name (EN)</Label>
          <Input id="nameEn" name="nameEn" required defaultValue={design?.nameEn ?? ""} data-testid="design-name-en" />
        </div>
      </div>
      {design?.code && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Code <span className="font-mono">{design.code}</span> (assigned once, never changes).
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="supplierId">Supplier</Label>
        <select
          id="supplierId"
          name="supplierId"
          required
          defaultValue={design?.supplierId ?? ""}
          data-testid="design-supplier"
          className="h-9 rounded-sm border border-input bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <option value="" disabled>Select a supplier…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="descriptionNo">Description — step 1 (NO)</Label>
          <Textarea id="descriptionNo" name="descriptionNo" rows={2} defaultValue={design?.descriptionNo ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="descriptionEn">Description — step 1 (EN)</Label>
          <Textarea id="descriptionEn" name="descriptionEn" rows={2} defaultValue={design?.descriptionEn ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="descriptionStep2No">Description above photos — step 2 (NO)</Label>
          <Textarea id="descriptionStep2No" name="descriptionStep2No" rows={2} defaultValue={design?.descriptionStep2No ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="descriptionStep2En">Description above photos — step 2 (EN)</Label>
          <Textarea id="descriptionStep2En" name="descriptionStep2En" rows={2} defaultValue={design?.descriptionStep2En ?? ""} />
        </div>
      </div>

      {design && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slug">Slug (public URL)</Label>
          <Input
            id="slug"
            name="slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setConfirming(false);
            }}
            data-testid="design-slug"
          />
          <p className="text-xs text-muted-foreground">
            /configurator?design=<span className="font-mono">{slug || "…"}</span>
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="previewImage">Preview image (PNG/JPG/WebP)</Label>
        <FileThumbInput
          name="previewImage"
          existingSrc={design?.previewImage ? assetUrl(design.previewImage) : null}
          testid="design-preview-image"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sortOrder">Sort order</Label>
          <Input id="sortOrder" name="sortOrder" type="number" min={0} defaultValue={design?.sortOrder ?? 0} />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={design ? design.active : false}
            className="size-4 accent-[var(--primary)]"
            data-testid="design-active"
          />
          Active (visible in the configurator)
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="acceptsCustomNotes"
          defaultChecked={design ? design.acceptsCustomNotes : false}
          className="size-4 accent-[var(--primary)]"
          data-testid="design-accepts-notes"
        />
        Accepts custom colour notes from the customer
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="acceptsCustomText"
          defaultChecked={design ? design.acceptsCustomText : false}
          className="size-4 accent-[var(--primary)]"
          data-testid="design-accepts-text"
        />
        Accepts custom text (inscription) on the ceramic
      </label>

      {state.error && (
        <p data-testid="design-error" role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      {/* R3-VARIE §B: a slug change is confirmed in place (no window.confirm),
          with the honest consequences spelled out. */}
      {slugChanged && confirming && (
        <div
          data-testid="design-slug-confirm"
          className="rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed"
        >
          <p className="text-sm font-medium">
            Change the public URL to “{slug.trim()}”?
          </p>
          <ul className="mt-1.5 list-disc pl-4 text-muted-foreground">
            <li>
              Direct links to <span className="font-mono">?design={design?.slug}</span>{" "}
              stop working.
            </li>
            <li>
              Shared configuration codes (<span className="font-mono">?code=</span> and
              share links) keep working — they resolve by code.
            </li>
            <li>
              This design&apos;s images are moved to the new folder automatically. If a
              single file cannot be moved, nothing is changed at all.
            </li>
          </ul>
          <input type="hidden" name="slugConfirmed" value="true" />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          size="lg"
          className="min-h-11"
          disabled={pending}
          data-testid={slugChanged && confirming ? "design-slug-confirm-save" : "design-save"}
        >
          {pending
            ? "Saving…"
            : slugChanged && confirming
              ? "Yes, change the URL and save"
              : "Save design"}
        </Button>
        {slugChanged && confirming && (
          <button
            type="button"
            onClick={() => {
              setSlug(design?.slug ?? "");
              setConfirming(false);
            }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Keep the current slug
          </button>
        )}
      </div>
    </form>
  );
}
