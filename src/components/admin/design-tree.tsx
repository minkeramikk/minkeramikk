"use client";

/**
 * F22 — Design accordion tree.
 *
 * Replaces the old flat CategoryEditor + "Manage options →" navigation with a
 * single-page accordion view: each category is an expandable row that shows
 * its options inline.  "+ Add option" and category edit/delete are also
 * inline — no more blind 3-level navigation.
 *
 * Data is server-rendered and passed as props; mutations call the existing
 * server actions (saveCategory / deleteCategory / saveOption / deleteOption)
 * which call revalidatePath, triggering a RSC refresh with updated props.
 */

import { useState, useEffect, useRef } from "react";
import { useActionState } from "react";
import {
  saveCategory,
  deleteCategory,
} from "@/app/admin/designs/actions";
import {
  saveOption,
  deleteOption,
  setDefaultOption,
} from "@/app/admin/designs/options-actions";
import { assetUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileThumbInput } from "@/components/admin/file-thumb-input";
import type { CategoryValues } from "./category-editor";

// ── types ────────────────────────────────────────────────────────────────────

export interface OptionSlot {
  id: string;
  name: string;
  hex: string | null;
  image: string | null;
  /** Compositing layer (the pre-coloured pattern PNG). Without it this option
   *  contributes nothing to the preview — F22-fix surfaces & lets you set it. */
  layerImage: string | null;
  code: string | null;
  sortOrder: number;
  active: boolean;
  isDefault: boolean;
}

export interface CategorySlot extends CategoryValues {
  options: OptionSlot[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

const LAYER_SLOTS = ["base", "mid", "detail", "extra", "top", "animal"] as const;

const selectCls =
  "h-9 rounded-sm border border-input bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

// ── info banner ──────────────────────────────────────────────────────────────

const BANNER_KEY = "mk-design-tree-banner-v1";

function InfoBanner() {
  // Start hidden (avoids flash of banner on users who dismissed it).
  // We hydrate from localStorage in useEffect.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(BANNER_KEY) !== "1") setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(BANNER_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      data-testid="design-tree-banner"
      role="note"
      className="mb-4 flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm"
    >
      <p className="flex-1 text-muted-foreground">
        A design is made of <strong className="font-medium text-foreground">categories</strong>;
        each category contains the{" "}
        <strong className="font-medium text-foreground">options</strong> your customers
        choose from. Expand a category to manage its options, or add a new one at the
        bottom.
      </p>
      <button
        type="button"
        onClick={dismiss}
        data-testid="design-tree-banner-dismiss"
        aria-label="Dismiss tip"
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}

// ── option swatch ─────────────────────────────────────────────────────────────

function OptionSwatch({ option }: { option: OptionSlot }) {
  // Prefer the compositing LAYER (the pattern in this colour) — that's the most
  // useful "what will it look like" preview on the row. Fall back to the swatch
  // photo, then the flat hex.
  if (option.layerImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={assetUrl(option.layerImage)}
        alt=""
        data-testid="option-row-thumb"
        className="size-8 shrink-0 rounded-md border border-border bg-card object-contain"
      />
    );
  }
  if (option.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={assetUrl(option.image)}
        alt=""
        data-testid="option-row-thumb"
        className="size-8 shrink-0 rounded-full border object-cover"
      />
    );
  }
  if (option.hex) {
    return (
      <span
        className="size-8 shrink-0 rounded-full border"
        style={{ backgroundColor: option.hex }}
        aria-hidden
      />
    );
  }
  return <span className="size-8 shrink-0 rounded-full border bg-muted" aria-hidden />;
}

// ── compact option row ────────────────────────────────────────────────────────

function TreeOptionRow({
  designId,
  categoryId,
  option,
}: {
  designId: string;
  categoryId: string;
  option: OptionSlot;
}) {
  const [delState, del, deleting] = useActionState(deleteOption, { error: null });
  const [editState, save, saving] = useActionState(saveOption, { error: null });
  const [defState, setDefault, settingDefault] = useActionState(setDefaultOption, {
    error: null,
  });
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);

  // close the edit form once the save succeeds (RSC refresh brings new props)
  const wasSaving = useRef(false);
  useEffect(() => {
    if (wasSaving.current && !saving && !editState.error) setEditing(false);
    wasSaving.current = saving;
  }, [saving, editState.error]);

  const noLayer = !option.layerImage;

  return (
    <div
      data-testid="tree-option-row"
      data-has-layer={option.layerImage ? "1" : "0"}
      className="border-b border-border/40 py-2 last:border-0"
    >
      <div className="flex items-center gap-2.5">
        <form action={setDefault} className="flex shrink-0 items-center">
          <input type="hidden" name="optionId" value={option.id} />
          <input type="hidden" name="categoryId" value={categoryId} />
          <input type="hidden" name="designId" value={designId} />
          <button
            type="submit"
            disabled={settingDefault || option.isDefault}
            data-testid="tree-option-default"
            data-default={option.isDefault ? "1" : "0"}
            aria-pressed={option.isDefault}
            aria-label={
              option.isDefault
                ? `${option.name} is the cover default`
                : `Set ${option.name} as the cover default`
            }
            title="Cover default — shown in the configurator step 1"
            className="size-4 rounded-full border border-input disabled:cursor-default aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:ring-2 aria-pressed:ring-primary/30"
          >
            <span className="sr-only">Default</span>
          </button>
        </form>
        <OptionSwatch option={option} />

        <span className="truncate text-sm">{option.name}</span>

        {noLayer && (
          <span
            data-testid="option-no-layer"
            title="No compositing layer — this option won't show in the preview"
            className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
          >
            no layer
          </span>
        )}

        <span className="ml-auto" />

        {option.code && (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {option.code}
          </span>
        )}
        {!option.active && (
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
            off
          </span>
        )}

        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          data-testid="tree-option-edit"
          aria-label={`Edit ${option.name}`}
          className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Edit
        </button>

        {/* delete with inline confirm */}
        {confirming ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <form action={del} className="inline">
              <input type="hidden" name="id" value={option.id} />
              <input type="hidden" name="designId" value={designId} />
              <button
                type="submit"
                disabled={deleting}
                data-testid="tree-option-confirm-delete"
                className="text-xs font-medium text-destructive"
              >
                {deleting ? "…" : "Delete"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs text-muted-foreground"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            data-testid="tree-option-delete"
            aria-label={`Delete ${option.name}`}
            className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
          >
            ✕
          </button>
        )}

        {delState.error && (
          <span role="alert" className="text-xs text-destructive">
            {delState.error}
          </span>
        )}

        {defState.error && (
          <span role="alert" className="text-xs text-destructive">
            {defState.error}
          </span>
        )}
      </div>

      {/* inline edit (name/hex/sort/active + replace swatch & compositing layer) */}
      {editing && (
        <form
          action={save}
          data-testid="tree-option-edit-form"
          className="mt-2 flex flex-col gap-2 rounded-sm bg-muted/30 p-2.5"
        >
          <input type="hidden" name="id" value={option.id} />
          <input type="hidden" name="categoryId" value={categoryId} />
          <input type="hidden" name="designId" value={designId} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Input name="name" defaultValue={option.name} required aria-label="Option name" />
            <Input name="hex" defaultValue={option.hex ?? ""} placeholder="#rrggbb" aria-label="Hex colour" />
            <Input
              name="sortOrder"
              type="number"
              min={0}
              defaultValue={option.sortOrder}
              aria-label="Sort order"
            />
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="active"
                defaultChecked={option.active}
                className="size-4 accent-[var(--primary)]"
              />
              Active
            </label>
            <label className="col-span-2 text-xs text-muted-foreground">
              Swatch image {option.image && <span className="text-foreground">✓ set</span>}
              <FileThumbInput
                name="image"
                existingSrc={option.image ? assetUrl(option.image) : null}
                testid="tree-option-edit-swatch"
              />
            </label>
            <label className="col-span-2 text-xs text-muted-foreground">
              Layer image (compositing){" "}
              {option.layerImage ? (
                <span className="text-foreground">✓ set</span>
              ) : (
                <span className="text-amber-700">— missing</span>
              )}
              <FileThumbInput
                name="layerImage"
                existingSrc={option.layerImage ? assetUrl(option.layerImage) : null}
                testid="tree-option-edit-layer"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" variant="outline" disabled={saving} data-testid="tree-option-edit-save">
              {saving ? "Saving…" : "Save option"}
            </Button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <span className="ml-auto text-[11px] text-muted-foreground">
              Leave a file empty to keep the current one.
            </span>
            {editState.error && (
              <span role="alert" className="text-xs text-destructive">
                {editState.error}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

// ── inline add-option form ────────────────────────────────────────────────────

function InlineAddOptionForm({
  designId,
  categoryId,
  defaultSortOrder,
  onClose,
}: {
  designId: string;
  categoryId: string;
  defaultSortOrder: number;
  onClose: () => void;
}) {
  const [state, add, adding] = useActionState(saveOption, { error: null });

  return (
    <form
      action={add}
      data-testid="inline-add-option-form"
      className="mt-2 flex flex-col gap-2 rounded-sm border border-dashed border-border p-2.5"
    >
      <input type="hidden" name="categoryId" value={categoryId} />
      <input type="hidden" name="designId" value={designId} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Input
          name="name"
          placeholder="Name"
          required
          aria-label="Option name"
        />
        <Input
          name="hex"
          placeholder="#rrggbb"
          aria-label="Hex colour"
        />
        <Input
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={defaultSortOrder}
          aria-label="Sort order"
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked
            className="size-4 accent-[var(--primary)]"
          />
          Active
        </label>
        <label className="col-span-2 text-xs text-muted-foreground">
          Swatch image
          <FileThumbInput name="image" testid="inline-add-option-swatch" />
        </label>
        <label className="col-span-2 text-xs text-muted-foreground">
          Layer image (compositing) — needed for the preview
          <FileThumbInput name="layerImage" testid="inline-add-option-layer" />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={adding}
          data-testid="inline-add-option-submit"
        >
          {adding ? "Adding…" : "Add option"}
        </Button>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        {state.error && (
          <span role="alert" className="text-xs text-destructive">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

// ── category accordion item ───────────────────────────────────────────────────

function CategoryItem({
  designId,
  cat,
}: {
  designId: string;
  cat: CategorySlot;
}) {
  const [editState, saveEdit, saving] = useActionState(saveCategory, {
    error: null,
  });
  const [delState, del, deleting] = useActionState(deleteCategory, {
    error: null,
  });
  const [showEdit, setShowEdit] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <details
      data-testid="category-accordion"
      className="group rounded-lg border border-border bg-card"
    >
      {/* ── summary row ─────────────────────────────────────────────────── */}
      <summary
        data-testid="category-summary"
        className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-3 py-2.5 select-none hover:bg-muted/30"
      >
        {/* chevron rotates when open via group-open */}
        <svg
          className="size-4 shrink-0 transition-transform duration-150 group-open:rotate-90"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>

        <span className="font-medium">{cat.labelEn}</span>
        {cat.labelNo && cat.labelNo !== cat.labelEn && (
          <span className="text-xs text-muted-foreground">/ {cat.labelNo}</span>
        )}

        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {cat.kind}
        </span>

        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {cat.options.length} option{cat.options.length !== 1 ? "s" : ""}
        </span>

        {cat.options.some((o) => !o.layerImage) && (
          <span
            data-testid="category-missing-layers"
            title="Some options have no compositing layer — the preview may be blank"
            className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
          >
            {cat.options.filter((o) => !o.layerImage).length} no layer
          </span>
        )}

        {/* Edit button */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            setShowEdit((v) => !v);
          }}
          data-testid="category-edit-toggle"
          aria-label="Edit category"
          className="shrink-0 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Edit
        </button>

        {/* Delete with confirm */}
        {confirmDel ? (
          <span className="flex shrink-0 items-center gap-1">
            <form
              action={del}
              className="inline"
              onClick={(e) => e.stopPropagation()}
            >
              <input type="hidden" name="id" value={cat.id} />
              <input type="hidden" name="designId" value={designId} />
              <button
                type="submit"
                disabled={deleting}
                data-testid="category-confirm-delete"
                className="rounded px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10"
              >
                {deleting ? "…" : "Delete"}
              </button>
            </form>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setConfirmDel(false);
              }}
              className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
            >
              No
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setConfirmDel(true);
            }}
            data-testid="category-delete"
            aria-label="Delete category"
            className="shrink-0 rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-destructive"
          >
            Delete
          </button>
        )}
      </summary>

      {/* ── accordion body ──────────────────────────────────────────────── */}
      <div className="border-t border-border px-3 pb-3 pt-2.5">
        {/* inline category edit form */}
        {showEdit && (
          <form
            action={saveEdit}
            className="mb-3 flex flex-col gap-2 rounded-sm bg-muted/30 p-2"
            data-testid="category-edit-form"
          >
            <input type="hidden" name="id" value={cat.id} />
            <input type="hidden" name="designId" value={designId} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              <Input
                name="labelNo"
                placeholder="Label (NO)"
                required
                defaultValue={cat.labelNo}
                aria-label="Label NO"
              />
              <Input
                name="labelEn"
                placeholder="Label (EN)"
                required
                defaultValue={cat.labelEn}
                aria-label="Label EN"
              />
              <select
                name="kind"
                defaultValue={cat.kind}
                className={selectCls}
                aria-label="Kind"
              >
                <option value="color">color</option>
                <option value="image">image</option>
              </select>
              <select
                name="layerSlot"
                defaultValue={cat.layerSlot}
                className={selectCls}
                aria-label="Layer slot"
              >
                {LAYER_SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <Input
                name="syncGroup"
                placeholder="sync group"
                defaultValue={cat.syncGroup ?? ""}
                aria-label="Sync group"
              />
              <Input
                name="sortOrder"
                type="number"
                min={0}
                defaultValue={cat.sortOrder}
                aria-label="Sort order"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={saving}
                data-testid="category-save"
              >
                {saving ? "Saving…" : "Save"}
              </Button>
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                className="text-sm text-muted-foreground"
              >
                Cancel
              </button>
              {editState.error && (
                <span role="alert" className="text-xs text-destructive">
                  {editState.error}
                </span>
              )}
            </div>
          </form>
        )}

        {/* options list */}
        {cat.options.length > 0 ? (
          <div data-testid="tree-options-list">
            {cat.options.map((opt) => (
              <TreeOptionRow
                key={opt.id}
                designId={designId}
                categoryId={cat.id}
                option={opt}
              />
            ))}
          </div>
        ) : (
          <p className="mb-2 text-xs italic text-muted-foreground">No options yet.</p>
        )}

        {/* add option */}
        {showAdd ? (
          <InlineAddOptionForm
            designId={designId}
            categoryId={cat.id}
            defaultSortOrder={cat.options.length}
            onClose={() => setShowAdd(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            data-testid="tree-add-option"
            className="mt-2 text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            + Add option
          </button>
        )}

        {delState.error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {delState.error}
          </p>
        )}
      </div>
    </details>
  );
}

// ── add category (collapsed toggle) ──────────────────────────────────────────

function AddCategoryForm({ designId }: { designId: string }) {
  const [state, add, adding] = useActionState(saveCategory, { error: null });
  const [show, setShow] = useState(false);

  if (!show) {
    return (
      <button
        type="button"
        onClick={() => setShow(true)}
        data-testid="add-category-button"
        className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:border-border/80 hover:text-foreground"
      >
        <span className="font-medium">+</span> Add category
      </button>
    );
  }

  return (
    <form
      action={add}
      className="mt-2 rounded-sm border border-dashed border-border p-2.5"
      data-testid="add-category-form"
    >
      <input type="hidden" name="designId" value={designId} />
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
        <Input
          name="labelNo"
          placeholder="Label (NO)"
          required
          aria-label="Label NO"
        />
        <Input
          name="labelEn"
          placeholder="Label (EN)"
          required
          aria-label="Label EN"
        />
        <select name="kind" defaultValue="color" className={selectCls} aria-label="Kind">
          <option value="color">color</option>
          <option value="image">image</option>
        </select>
        <select
          name="layerSlot"
          defaultValue="base"
          className={selectCls}
          aria-label="Layer slot"
        >
          {LAYER_SLOTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Input
          name="syncGroup"
          placeholder="sync group"
          aria-label="Sync group"
        />
        <Input
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={0}
          aria-label="Sort order"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={adding} data-testid="add-category-submit">
          {adding ? "Adding…" : "Add category"}
        </Button>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="text-sm text-muted-foreground"
        >
          Cancel
        </button>
        {state.error && (
          <span role="alert" data-testid="add-category-error" className="text-xs text-destructive">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

// ── main export ───────────────────────────────────────────────────────────────

export function DesignTree({
  designId,
  categories,
}: {
  designId: string;
  categories: CategorySlot[];
}) {
  return (
    <div data-testid="design-tree">
      <InfoBanner />
      <div className="flex flex-col gap-2">
        {categories.map((cat) => (
          <CategoryItem key={cat.id} designId={designId} cat={cat} />
        ))}
      </div>
      <AddCategoryForm designId={designId} />
    </div>
  );
}
