"use client";

import { useActionState } from "react";
import {
  saveOption,
  deleteOption,
  type OptionFormState,
} from "@/app/admin/designs/options-actions";
import { assetUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface OptionValues {
  id: string;
  name: string;
  hex: string | null;
  image: string | null;
  layerImage: string | null;
  sortOrder: number;
  active: boolean;
}

const initial: OptionFormState = { error: null };

function Fields({ o }: { o?: OptionValues }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Input name="name" placeholder="Name" required defaultValue={o?.name ?? ""} aria-label="Name" />
      <Input name="hex" placeholder="#rrggbb" defaultValue={o?.hex ?? ""} aria-label="Hex" />
      <Input name="sortOrder" type="number" min={0} defaultValue={o?.sortOrder ?? 0} aria-label="Sort order" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={o ? o.active : true} className="size-4 accent-[var(--primary)]" aria-label="Active" />
        Active
      </label>
      <label className="text-xs text-muted-foreground">
        Swatch image
        <Input name="image" type="file" accept="image/png,image/jpeg,image/webp" className="mt-1" />
      </label>
      <label className="text-xs text-muted-foreground">
        Layer image (compositing)
        <Input name="layerImage" type="file" accept="image/png,image/jpeg,image/webp" className="mt-1" />
      </label>
    </div>
  );
}

function OptionRow({ designId, categoryId, option }: { designId: string; categoryId: string; option: OptionValues }) {
  const [state, save, saving] = useActionState(saveOption, initial);
  const [delState, del, deleting] = useActionState(deleteOption, initial);
  return (
    <div data-testid="option-row" className="rounded-sm border border-border bg-card p-2.5">
      <form action={save} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={option.id} />
        <input type="hidden" name="categoryId" value={categoryId} />
        <input type="hidden" name="designId" value={designId} />
        <div className="flex items-center gap-2">
          {option.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- catalog art from storage
            <img src={assetUrl(option.image)} alt="" className="size-9 rounded-full border object-cover" />
          ) : option.hex ? (
            <span className="size-9 rounded-full border" style={{ backgroundColor: option.hex }} aria-hidden />
          ) : null}
          <Fields o={option} />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" variant="outline" disabled={saving} data-testid="option-save">
            {saving ? "Saving…" : "Save"}
          </Button>
          {(state.error || delState.error) && (
            <span role="alert" data-testid="option-error" className="text-xs text-destructive">
              {state.error ?? delState.error}
            </span>
          )}
        </div>
      </form>
      <form action={del} className="mt-1.5">
        <input type="hidden" name="id" value={option.id} />
        <input type="hidden" name="designId" value={designId} />
        <button type="submit" disabled={deleting} data-testid="option-delete" className="text-xs text-destructive underline-offset-2 hover:underline">
          {deleting ? "Deleting…" : "Delete option"}
        </button>
      </form>
    </div>
  );
}

function AddOptionForm({ designId, categoryId }: { designId: string; categoryId: string }) {
  const [state, add, adding] = useActionState(saveOption, initial);
  return (
    <form action={add} className="flex flex-col gap-2 rounded-sm border border-dashed border-border p-2.5" data-testid="add-option-form">
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="designId" value={designId} />
      <Fields />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={adding} data-testid="option-add">
          {adding ? "Adding…" : "Add option"}
        </Button>
        {state.error && (
          <span role="alert" data-testid="add-option-error" className="text-xs text-destructive">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

export function OptionEditor({
  designId,
  categoryId,
  options,
}: {
  designId: string;
  categoryId: string;
  options: OptionValues[];
}) {
  return (
    <div className="flex flex-col gap-2.5" data-testid="option-editor">
      {options.map((o) => (
        <OptionRow key={o.id} designId={designId} categoryId={categoryId} option={o} />
      ))}
      <AddOptionForm designId={designId} categoryId={categoryId} />
    </div>
  );
}
