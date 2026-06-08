"use client";

import { useActionState } from "react";
import {
  saveProduct,
  deleteProduct,
  type ProductFormState,
} from "@/app/admin/products/actions";
import { assetUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ProductValues {
  id: string;
  nameNo: string;
  nameEn: string;
  descriptionNo: string | null;
  descriptionEn: string | null;
  priceCents: number;
  supplierId: string;
  image: string | null;
  visible: boolean;
  sortOrder: number;
}

const initial: ProductFormState = { error: null };

/** cents → editable kr string ("1500" or "1500,50"). */
function centsToInput(cents: number): string {
  if (cents % 100 === 0) return String(cents / 100);
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function ProductForm({
  product,
  suppliers,
}: {
  product?: ProductValues;
  suppliers: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(saveProduct, initial);
  const [delState, delAction, delPending] = useActionState(deleteProduct, initial);

  return (
    <div className="max-w-lg">
      <form action={formAction} className="flex flex-col gap-4" data-testid="product-form">
        {product && <input type="hidden" name="id" value={product.id} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nameNo">Name (NO)</Label>
            <Input id="nameNo" name="nameNo" required defaultValue={product?.nameNo ?? ""} data-testid="product-name-no" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nameEn">Name (EN)</Label>
            <Input id="nameEn" name="nameEn" required defaultValue={product?.nameEn ?? ""} data-testid="product-name-en" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="descriptionNo">Description (NO)</Label>
            <Textarea id="descriptionNo" name="descriptionNo" rows={2} defaultValue={product?.descriptionNo ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="descriptionEn">Description (EN)</Label>
            <Textarea id="descriptionEn" name="descriptionEn" rows={2} defaultValue={product?.descriptionEn ?? ""} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="price">Price (kr)</Label>
            <Input
              id="price"
              name="price"
              inputMode="decimal"
              placeholder="1500 or 1500,50"
              required
              defaultValue={product ? centsToInput(product.priceCents) : ""}
              data-testid="product-price"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplierId">Supplier</Label>
            <select
              id="supplierId"
              name="supplierId"
              required
              defaultValue={product?.supplierId ?? ""}
              data-testid="product-supplier"
              className="h-9 rounded-sm border border-input bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <option value="" disabled>
                Select a supplier…
              </option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="image">Image (PNG/JPG/WebP)</Label>
          {product?.image && (
            // eslint-disable-next-line @next/next/no-img-element -- catalog art from storage
            <img src={assetUrl(product.image)} alt="" className="mb-1 size-20 rounded-sm border object-contain" />
          )}
          <Input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" data-testid="product-image" />
          {product && <p className="text-xs text-muted-foreground">Leave empty to keep the current image.</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sortOrder">Sort order</Label>
            <Input id="sortOrder" name="sortOrder" type="number" min={0} defaultValue={product?.sortOrder ?? 0} />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              name="visible"
              defaultChecked={product ? product.visible : true}
              className="size-4 accent-[var(--primary)]"
              data-testid="product-visible"
            />
            Visible in the shop
          </label>
        </div>

        {state.error && (
          <p data-testid="product-error" role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}

        <div>
          <Button type="submit" size="lg" className="min-h-11" disabled={pending} data-testid="product-save">
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>

      {product && (
        <form action={delAction} className="mt-8 border-t border-border pt-5" data-testid="product-delete-form">
          <input type="hidden" name="id" value={product.id} />
          {delState.error && (
            <p data-testid="product-delete-error" role="alert" className="mb-2 text-sm text-destructive">
              {delState.error}
            </p>
          )}
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={delPending}
            data-testid="product-delete"
            className="border-destructive/40 text-destructive hover:bg-destructive/5"
          >
            {delPending ? "Deleting…" : "Delete product"}
          </Button>
        </form>
      )}
    </div>
  );
}
