"use client";

import { useState } from "react";
import {
  ATTRIBUTE_REGISTRY,
  ATTR_LABEL_MAX,
  ATTR_VALUE_MAX,
  type AttributeKey,
  type TypedAttribute,
} from "@/lib/catalog/product-attributes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Editable row mirrors TypedAttribute but keeps strings for the inputs. */
interface Row {
  key: AttributeKey;
  labelNo: string;
  labelEn: string;
  value: string;
  valueNum: string; // text in the number input; coerced server-side
}

const TYPE_OPTIONS: { key: AttributeKey; label: string }[] = [
  { key: "weight", label: "Weight (g)" },
  { key: "diameter", label: "Diameter (mm)" },
  { key: "dimensions", label: "Dimensions (text)" },
  { key: "custom", label: "Custom" },
];

function toRow(a: TypedAttribute): Row {
  return {
    key: a.key,
    labelNo: a.labelNo ?? "",
    labelEn: a.labelEn ?? "",
    value: a.value ?? "",
    valueNum: a.valueNum == null ? "" : String(a.valueNum),
  };
}

/**
 * R2-3+R2-4 (Part A) — typed attribute rows. Each row picks a TYPE; numeric
 * types show a number input + unit, `dimensions` a text input, `custom` a
 * bilingual label + value. The whole list rides ONE hidden `attributes` JSON
 * field; the server action validates + replaces on save.
 */
export function ProductAttributesEditor({
  initial,
}: {
  initial: TypedAttribute[];
}) {
  const [rows, setRows] = useState<Row[]>(initial.map(toRow));

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function add() {
    setRows((rs) => [...rs, { key: "custom", labelNo: "", labelEn: "", value: "", valueNum: "" }]);
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

  // Serialize only complete rows, shaped per kind so the server parse accepts them.
  const serialized = JSON.stringify(
    rows
      .map((r) => {
        const kind = ATTRIBUTE_REGISTRY[r.key].kind;
        if (kind === "num") {
          return r.valueNum.trim() === ""
            ? null
            : { key: r.key, valueNum: r.valueNum.trim() };
        }
        if (r.key === "custom") {
          const labelNo = r.labelNo.trim();
          const labelEn = r.labelEn.trim();
          const value = r.value.trim();
          return labelNo && labelEn && value ? { key: r.key, labelNo, labelEn, value } : null;
        }
        const value = r.value.trim();
        return value ? { key: r.key, value } : null;
      })
      .filter(Boolean)
  );

  return (
    <div className="flex flex-col gap-3" data-testid="product-attributes">
      <input type="hidden" name="attributes" value={serialized} />
      <p className="text-sm font-medium">Product details</p>

      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No details yet. Add weight, diameter, dimensions…
        </p>
      )}

      {rows.map((r, i) => {
        const def = ATTRIBUTE_REGISTRY[r.key];
        return (
          <div
            key={i}
            data-testid="attribute-row"
            className="flex flex-col gap-2 rounded-sm border border-border p-2"
          >
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Type</Label>
                <select
                  value={r.key}
                  data-testid="attribute-type"
                  onChange={(e) => update(i, { key: e.target.value as AttributeKey })}
                  className="h-9 rounded-sm border border-input bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {def.kind === "num" ? (
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Value ({def.inputUnit})</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={r.valueNum}
                    data-testid="attribute-value-num"
                    onChange={(e) => update(i, { valueNum: e.target.value })}
                  />
                </div>
              ) : r.key === "custom" ? (
                <>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Label (NO)</Label>
                    <Input
                      value={r.labelNo}
                      maxLength={ATTR_LABEL_MAX}
                      data-testid="attribute-label-no"
                      onChange={(e) => update(i, { labelNo: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Label (EN)</Label>
                    <Input
                      value={r.labelEn}
                      maxLength={ATTR_LABEL_MAX}
                      data-testid="attribute-label-en"
                      onChange={(e) => update(i, { labelEn: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Value</Label>
                    <Input
                      value={r.value}
                      maxLength={ATTR_VALUE_MAX}
                      data-testid="attribute-value"
                      onChange={(e) => update(i, { value: e.target.value })}
                    />
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Value</Label>
                  <Input
                    value={r.value}
                    maxLength={ATTR_VALUE_MAX}
                    data-testid="attribute-value"
                    onChange={(e) => update(i, { value: e.target.value })}
                  />
                </div>
              )}

              <div className="flex items-end gap-1">
                <Button type="button" variant="outline" size="icon-sm" aria-label="Move up" data-testid="attribute-up" onClick={() => move(i, -1)}>↑</Button>
                <Button type="button" variant="outline" size="icon-sm" aria-label="Move down" data-testid="attribute-down" onClick={() => move(i, 1)}>↓</Button>
                <Button type="button" variant="outline" size="icon-sm" aria-label="Remove" data-testid="attribute-remove" className="border-destructive/40 text-destructive hover:bg-destructive/5" onClick={() => remove(i)}>✕</Button>
              </div>
            </div>
          </div>
        );
      })}

      <div>
        <Button type="button" variant="outline" size="sm" data-testid="attribute-add" onClick={add}>
          + Add detail
        </Button>
      </div>
    </div>
  );
}
