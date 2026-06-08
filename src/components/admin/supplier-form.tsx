"use client";

import { useActionState } from "react";
import {
  saveSupplier,
  deleteSupplier,
  type SupplierFormState,
} from "@/app/admin/suppliers/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface SupplierValues {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  active: boolean;
}

const initial: SupplierFormState = { error: null };

export function SupplierForm({ supplier }: { supplier?: SupplierValues }) {
  const [state, formAction, pending] = useActionState(saveSupplier, initial);
  const [delState, delAction, delPending] = useActionState(
    deleteSupplier,
    initial
  );

  return (
    <div className="max-w-lg">
      <form action={formAction} className="flex flex-col gap-4" data-testid="supplier-form">
        {supplier && <input type="hidden" name="id" value={supplier.id} />}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required defaultValue={supplier?.name ?? ""} data-testid="supplier-name" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={supplier?.email ?? ""} data-testid="supplier-email" />
          <p className="text-xs text-muted-foreground">Visible to admins only (ADR 0009).</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={supplier?.phone ?? ""} data-testid="supplier-phone" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={supplier?.notes ?? ""} data-testid="supplier-notes" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={supplier ? supplier.active : true}
            className="size-4 accent-[var(--primary)]"
            data-testid="supplier-active"
          />
          Active
        </label>

        {state.error && (
          <p data-testid="supplier-error" role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="submit" size="lg" className="min-h-11" disabled={pending} data-testid="supplier-save">
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>

      {supplier && (
        <form action={delAction} className="mt-8 border-t border-border pt-5" data-testid="supplier-delete-form">
          <input type="hidden" name="id" value={supplier.id} />
          <p className="mb-2 text-sm text-muted-foreground">
            Delete this supplier. Blocked if it still owns designs or products.
          </p>
          {delState.error && (
            <p data-testid="supplier-delete-error" role="alert" className="mb-2 text-sm text-destructive">
              {delState.error}
            </p>
          )}
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={delPending}
            data-testid="supplier-delete"
            className="border-destructive/40 text-destructive hover:bg-destructive/5"
          >
            {delPending ? "Deleting…" : "Delete supplier"}
          </Button>
        </form>
      )}
    </div>
  );
}
