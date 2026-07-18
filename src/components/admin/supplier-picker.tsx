"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Picks which supplier's ceramics the products page shows (?supplier=<id>). */
export function SupplierPicker({
  suppliers,
  selectedId,
}: {
  suppliers: { id: string; name: string }[];
  selectedId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      Supplier
      <select
        value={selectedId}
        disabled={pending}
        onChange={(e) =>
          startTransition(() =>
            router.push(`/admin/products?supplier=${e.target.value}`)
          )
        }
        data-testid="products-supplier-picker"
        className="h-9 rounded-lg border border-border bg-card px-2 text-sm font-normal"
      >
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
