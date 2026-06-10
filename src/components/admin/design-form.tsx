"use client";

import { useActionState } from "react";
import { saveDesign, type DesignFormState } from "@/app/admin/designs/actions";
import { assetUrl } from "@/lib/storage";
import { FileThumbInput } from "@/components/admin/file-thumb-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface DesignValues {
  id: string;
  name: string;
  descriptionNo: string | null;
  descriptionEn: string | null;
  supplierId: string;
  previewImage: string | null;
  sortOrder: number;
  active: boolean;
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

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4" data-testid="design-form">
      {design && <input type="hidden" name="id" value={design.id} />}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required defaultValue={design?.name ?? ""} data-testid="design-name" />
        {design?.code && (
          <p className="text-xs text-muted-foreground">
            Code <span className="font-mono">{design.code}</span> (assigned once, never changes).
          </p>
        )}
      </div>

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
          <Label htmlFor="descriptionNo">Description (NO)</Label>
          <Textarea id="descriptionNo" name="descriptionNo" rows={2} defaultValue={design?.descriptionNo ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="descriptionEn">Description (EN)</Label>
          <Textarea id="descriptionEn" name="descriptionEn" rows={2} defaultValue={design?.descriptionEn ?? ""} />
        </div>
      </div>

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

      {state.error && (
        <p data-testid="design-error" role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div>
        <Button type="submit" size="lg" className="min-h-11" disabled={pending} data-testid="design-save">
          {pending ? "Saving…" : "Save design"}
        </Button>
      </div>
    </form>
  );
}
