"use client";

import { useState } from "react";
import type { ProductAttribute } from "@/lib/catalog/product-attributes";
import { ATTR_VALUE_MAX } from "@/lib/catalog/product-attributes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * R2-4a — repeatable attribute rows (label NO / label EN / value) with
 * add / remove / reorder. The whole list rides ONE hidden `attributes` JSON
 * field; the server action parses + replaces (delete+insert) on save. Empty
 * rows are dropped client-side so a stray blank line never blocks the form.
 */
export function ProductAttributesEditor({
  initial,
}: {
  initial: ProductAttribute[];
}) {
  const [rows, setRows] = useState<ProductAttribute[]>(initial);

  function update(i: number, patch: Partial<ProductAttribute>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function add() {
    setRows((rs) => [...rs, { labelNo: "", labelEn: "", value: "" }]);
  }
  function remove(i: number) {
    setRows((rs) => rs.filter((_, j) => j !== i));
  }
  function move(i: number, dir: -1 | 1) {
    setRows((rs) => {
      const t = i + dir;
      if (t < 0 || t >= rs.length) return rs;
      const next = rs.slice();
      [next[i], next[t]] = [next[t], next[i]];
      return next;
    });
  }

  // Only complete rows travel (label NO + label EN + value all non-empty).
  const serialized = JSON.stringify(
    rows
      .map((r) => ({
        labelNo: r.labelNo.trim(),
        labelEn: r.labelEn.trim(),
        value: r.value.trim(),
      }))
      .filter((r) => r.labelNo && r.labelEn && r.value)
  );

  return (
    <div className="flex flex-col gap-3" data-testid="product-attributes">
      <input type="hidden" name="attributes" value={serialized} />
      <p className="text-sm font-medium">Product details</p>

      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No details yet. Add dimensions, weight, material…
        </p>
      )}

      {rows.map((r, i) => (
        <div
          key={i}
          data-testid="attribute-row"
          className="grid grid-cols-1 gap-2 rounded-sm border border-border p-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Label (NO)</Label>
            <Input
              value={r.labelNo}
              onChange={(e) => update(i, { labelNo: e.target.value })}
              data-testid="attribute-label-no"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Label (EN)</Label>
            <Input
              value={r.labelEn}
              onChange={(e) => update(i, { labelEn: e.target.value })}
              data-testid="attribute-label-en"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Value</Label>
            <Input
              value={r.value}
              maxLength={ATTR_VALUE_MAX}
              onChange={(e) => update(i, { value: e.target.value })}
              data-testid="attribute-value"
            />
          </div>
          <div className="flex items-end gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Move up"
              data-testid="attribute-up"
              onClick={() => move(i, -1)}
            >
              ↑
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Move down"
              data-testid="attribute-down"
              onClick={() => move(i, 1)}
            >
              ↓
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Remove"
              data-testid="attribute-remove"
              className="border-destructive/40 text-destructive hover:bg-destructive/5"
              onClick={() => remove(i)}
            >
              ✕
            </Button>
          </div>
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="attribute-add"
          onClick={add}
        >
          + Add detail
        </Button>
      </div>
    </div>
  );
}
