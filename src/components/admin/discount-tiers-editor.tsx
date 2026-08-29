"use client";

import { useActionState, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveDiscountTiers, type ActionResult } from "@/app/admin/discounts/actions";

interface Row {
  key: string;
  minQty: string;
  pct: string;
}

const initial: ActionResult = {};

export function DiscountTiersEditor({
  initialTiers,
  initialEnabled,
}: {
  initialTiers: { minQty: number; pct: number }[];
  initialEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveDiscountTiers, initial);

  // Client-only row ids (never sent to the server — sort_order is derived from
  // the sorted min_qty on submit, cf. saveDiscountTiers). crypto.randomUUID()
  // is undefined outside a secure context (plain http, e.g. a LAN IP during a
  // real-device responsive check) — useId() + a counter needs neither https
  // nor a browser API, just React itself.
  const idBase = useId();
  const nextRowSeq = useRef(0);
  function newRow(minQty = "", pct = ""): Row {
    return { key: `${idBase}-${nextRowSeq.current++}`, minQty, pct };
  }

  const [rows, setRows] = useState<Row[]>(() =>
    initialTiers.length > 0
      ? initialTiers.map((t) => newRow(String(t.minQty), String(t.pct)))
      : [newRow()]
  );
  const [enabled, setEnabled] = useState(initialEnabled);
  const [edited, setEdited] = useState(false);

  function updateRow(key: string, field: "minQty" | "pct", value: string) {
    setEdited(true);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setEdited(true);
    setRows((rs) => [...rs, newRow()]);
  }
  function removeRow(key: string) {
    setEdited(true);
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  const tiersJson = JSON.stringify(
    rows.map((r) => ({ min_qty: Number(r.minQty), pct: Number(r.pct) }))
  );

  return (
    <form
      action={formAction}
      onSubmit={() => setEdited(false)}
      data-testid="discounts-tiers-form"
      className="flex max-w-lg flex-col gap-3"
    >
      <input type="hidden" name="tiers" value={tiersJson} />

      {/* master switch — the header of this panel */}
      <label className="flex cursor-pointer items-center gap-2">
        <input
          // same controlled-checkbox remount guard as the product picker: forces
          // a fresh DOM node whenever the value flips, so a same-page
          // revalidatePath() after submit can never leave the DOM out of sync.
          key={enabled ? "on" : "off"}
          type="checkbox"
          name="enabled"
          className="size-4 accent-[var(--primary)]"
          checked={enabled}
          onChange={(e) => { setEnabled(e.target.checked); setEdited(true); }}
          data-testid="tiers-enabled"
        />
        <span className="text-sm font-medium">Quantity discounts enabled</span>
      </label>
      <p className="text-xs text-muted-foreground">
        One scale for every included product (see “Applies to” below). Same
        ceramic ordered across different designs counts together toward these
        thresholds.
      </p>

      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2" data-testid="tier-row">
            <Input
              type="number"
              min={2}
              max={999}
              value={row.minQty}
              onChange={(e) => updateRow(row.key, "minQty", e.target.value)}
              placeholder="qty"
              className="w-20"
              data-testid="tier-min"
            />
            <span className="text-sm text-muted-foreground">pcs →</span>
            <Input
              type="number"
              min={1}
              max={90}
              value={row.pct}
              onChange={(e) => updateRow(row.key, "pct", e.target.value)}
              placeholder="%"
              className="w-16"
              data-testid="tier-pct"
            />
            <span className="text-sm text-muted-foreground">%</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeRow(row.key)}
              data-testid="tier-remove"
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" className="self-start" onClick={addRow} data-testid="tier-add">
        Add step
      </Button>

      {state.error && (
        <p role="alert" className="text-sm text-destructive" data-testid="tiers-error">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" className="min-h-11" disabled={pending} data-testid="tiers-save">
          {pending ? "Saving…" : "Save scale"}
        </Button>
        {state.notice && !edited && !pending && (
          <span className="text-sm font-medium text-[var(--primary)]" data-testid="tiers-saved" role="status">
            {state.notice}
          </span>
        )}
      </div>
    </form>
  );
}
