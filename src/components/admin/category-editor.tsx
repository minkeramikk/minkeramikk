"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  saveCategory,
  deleteCategory,
  type DesignFormState,
} from "@/app/admin/designs/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface CategoryValues {
  id: string;
  labelNo: string;
  labelEn: string;
  kind: "color" | "image";
  layerSlot: string;
  syncGroup: string | null;
  sortOrder: number;
}

const LAYER_SLOTS = ["base", "mid", "detail", "extra", "top", "animal"];
const initial: DesignFormState = { error: null };

const selectCls =
  "h-9 rounded-sm border border-input bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

function Fields({ c }: { c?: CategoryValues }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
      <Input name="labelNo" placeholder="Label (NO)" required defaultValue={c?.labelNo ?? ""} aria-label="Label NO" />
      <Input name="labelEn" placeholder="Label (EN)" required defaultValue={c?.labelEn ?? ""} aria-label="Label EN" />
      <select name="kind" defaultValue={c?.kind ?? "color"} className={selectCls} aria-label="Kind">
        <option value="color">color</option>
        <option value="image">image</option>
      </select>
      <select name="layerSlot" defaultValue={c?.layerSlot ?? "base"} className={selectCls} aria-label="Layer slot">
        {LAYER_SLOTS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <Input name="syncGroup" placeholder="sync group" defaultValue={c?.syncGroup ?? ""} aria-label="Sync group" />
      <Input name="sortOrder" type="number" min={0} defaultValue={c?.sortOrder ?? 0} aria-label="Sort order" />
    </div>
  );
}

function CategoryRow({ designId, category }: { designId: string; category: CategoryValues }) {
  const [state, save, saving] = useActionState(saveCategory, initial);
  const [delState, del, deleting] = useActionState(deleteCategory, initial);
  return (
    <div data-testid="category-row" className="rounded-sm border border-border bg-card p-2.5">
      <form action={save} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={category.id} />
        <input type="hidden" name="designId" value={designId} />
        <Fields c={category} />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" variant="outline" disabled={saving} data-testid="category-save">
            {saving ? "Saving…" : "Save"}
          </Button>
          {(state.error || delState.error) && (
            <span role="alert" className="text-xs text-destructive">
              {state.error ?? delState.error}
            </span>
          )}
        </div>
      </form>
      <div className="mt-1.5 flex items-center gap-4">
        <Link
          href={`/admin/designs/${designId}/categories/${category.id}`}
          data-testid="manage-options"
          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Manage options →
        </Link>
        <form action={del}>
          <input type="hidden" name="id" value={category.id} />
          <input type="hidden" name="designId" value={designId} />
          <button
            type="submit"
            disabled={deleting}
            data-testid="category-delete"
            className="text-xs text-destructive underline-offset-2 hover:underline"
          >
            {deleting ? "Deleting…" : "Delete category"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AddCategoryForm({ designId }: { designId: string }) {
  const [state, add, adding] = useActionState(saveCategory, initial);
  return (
    <form action={add} className="flex flex-col gap-2 rounded-sm border border-dashed border-border p-2.5" data-testid="add-category-form">
      <input type="hidden" name="designId" value={designId} />
      <Fields />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={adding} data-testid="category-add">
          {adding ? "Adding…" : "Add category"}
        </Button>
        {state.error && (
          <span role="alert" data-testid="category-error" className="text-xs text-destructive">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

export function CategoryEditor({
  designId,
  categories,
}: {
  designId: string;
  categories: CategoryValues[];
}) {
  return (
    <div className="flex flex-col gap-2.5" data-testid="category-editor">
      {categories.map((c) => (
        <CategoryRow key={c.id} designId={designId} category={c} />
      ))}
      <AddCategoryForm designId={designId} />
    </div>
  );
}
