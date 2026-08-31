"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProductPicker, type EditorProduct } from "@/components/admin/product-multi-select";
import {
  saveDiscountRule,
  deleteDiscountRule,
  toggleAutomations,
  type ActionResult,
} from "@/app/admin/discounts/actions";

export interface EditorRule {
  id: string; // "" for a rule not yet saved
  name: string;
  enabled: boolean;
  triggerMinQty: number;
  triggerProductIds: string[];
  suggestedProductId: string;
  suggestedQty: number;
  discountMode: "fixed" | "inherited" | "none";
  discountPct: number | null;
}

const initial: ActionResult = {};
// Minor 3 (review round 1): same focus ring as order-status-form.tsx /
// product-form.tsx's native selects.
const selectCls =
  "h-9 rounded-sm border border-input bg-card px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

const blankRule = (): EditorRule => ({
  id: "",
  name: "",
  enabled: true,
  triggerMinQty: 1,
  triggerProductIds: [],
  suggestedProductId: "",
  suggestedQty: 1,
  // "sul serveringsfat ci metto un 15%" — the client's own default (ADR 0023).
  discountMode: "fixed",
  discountPct: null,
});

/** Master switch. `toggleAutomations` is a plain single-arg action (no
 *  useActionState, which needs a (state, formData) signature) — a manual
 *  useTransition + FormData round trip instead, kept out of a <form> since a
 *  rule card below is its own <form> and HTML forbids nesting them. */
function AutomationsSwitch({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function save() {
    setError(undefined);
    const fd = new FormData();
    fd.set("enabled", enabled ? "on" : "off");
    startTransition(async () => {
      const res = await toggleAutomations(fd);
      setError(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          key={enabled ? "on" : "off"}
          type="checkbox"
          className="size-4 accent-[var(--primary)]"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          data-testid="automations-enabled"
        />
        <span className="text-sm font-medium">Automations enabled</span>
      </label>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={save} data-testid="automations-save">
        {pending ? "Saving…" : "Save"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

function RuleCard({
  rule,
  products,
  onRemove,
}: {
  rule: EditorRule;
  products: EditorProduct[];
  onRemove: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveDiscountRule, initial);
  // the id the DB assigned on first save — turns the next submit into an
  // UPDATE and gives delete something to point at.
  const [id, setId] = useState(rule.id);
  useEffect(() => {
    if (state.id && !id) setId(state.id);
  }, [state.id, id]);

  const [name, setName] = useState(rule.name);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [triggerMinQty, setTriggerMinQty] = useState(String(rule.triggerMinQty));
  const [triggerSelected, setTriggerSelected] = useState<Set<string>>(
    new Set(rule.triggerProductIds)
  );
  const [suggestedProductId, setSuggestedProductId] = useState(rule.suggestedProductId);
  const [suggestedQty, setSuggestedQty] = useState(String(rule.suggestedQty));
  const [discountMode, setDiscountMode] = useState<EditorRule["discountMode"]>(rule.discountMode);
  const [discountPct, setDiscountPct] = useState(
    rule.discountPct !== null ? String(rule.discountPct) : ""
  );
  const [edited, setEdited] = useState(false);

  // C2 (mirrored client-side): disabled AND cleared for inherited/none, so a
  // leftover fixed % can't ride along looking like it still applies.
  useEffect(() => {
    if (discountMode !== "fixed") setDiscountPct("");
  }, [discountMode]);

  // Review round 1, Important 5: the trigger/suggested supplier ids are no
  // longer computed or submitted here — saveDiscountRule looks them up itself
  // from the DB, so a stale/wrong client-side product list can no longer
  // produce a cryptic refusal on a field the admin never sees.

  const [deletePending, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string>();

  function handleDelete() {
    if (!id) {
      onRemove(); // never saved — nothing to confirm or delete server-side
      return;
    }
    if (!confirm(`Delete rule "${name || "Untitled"}"?`)) return;
    setDeleteError(undefined);
    startDelete(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await deleteDiscountRule(fd);
      // Review round 1, Important 3: only remove the card once the DELETE
      // actually succeeded — before this, a successful delete and a failed
      // one looked identical (card stayed put either way).
      if (res.error) setDeleteError(res.error);
      else onRemove();
    });
  }

  return (
    <div className="rounded-lg border border-border p-4" data-testid="rule-card">
      <form action={formAction} onSubmit={() => setEdited(false)} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="triggerProductIds" value={JSON.stringify([...triggerSelected])} />

        <div className="flex items-center gap-3">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setEdited(true);
            }}
            name="name"
            placeholder="Rule name"
            className="max-w-xs"
            data-testid="rule-name"
          />
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
            <input
              key={enabled ? "on" : "off"}
              type="checkbox"
              name="enabled"
              className="size-4 accent-[var(--primary)]"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                setEdited(true);
              }}
              data-testid="rule-enabled"
            />
            Enabled
          </label>
        </div>

        <p className="flex flex-wrap items-center gap-2 text-sm">
          WHEN cart has
          <Input
            type="number"
            min={1}
            max={999}
            value={triggerMinQty}
            onChange={(e) => {
              setTriggerMinQty(e.target.value);
              setEdited(true);
            }}
            name="triggerMinQty"
            className="w-20"
            data-testid="rule-min-qty"
          />
          pieces from
        </p>

        <ProductPicker
          products={products}
          selected={triggerSelected}
          onToggle={(pid) => {
            setEdited(true);
            setTriggerSelected((s) => {
              const n = new Set(s);
              if (n.has(pid)) n.delete(pid);
              else n.add(pid);
              return n;
            });
          }}
          onSelectAll={(ids) => {
            setEdited(true);
            setTriggerSelected((s) => new Set([...s, ...ids]));
          }}
          onClear={() => {
            setEdited(true);
            setTriggerSelected(new Set());
          }}
          labels={{
            searchPlaceholder: "Search products…",
            counterSuffix: "in the trigger group",
            emptyHint: "Pick at least one product for the trigger group.",
          }}
          testIdPrefix="rule-trigger"
        />

        <p className="flex flex-wrap items-center gap-2 text-sm">
          SUGGEST
          <Input
            type="number"
            min={1}
            max={99}
            value={suggestedQty}
            onChange={(e) => {
              setSuggestedQty(e.target.value);
              setEdited(true);
            }}
            name="suggestedQty"
            className="w-16"
            data-testid="rule-suggested-qty"
          />
          ×
          <select
            name="suggestedProductId"
            value={suggestedProductId}
            onChange={(e) => {
              setSuggestedProductId(e.target.value);
              setEdited(true);
            }}
            className={selectCls}
            data-testid="rule-suggested-product"
          >
            <option value="" disabled>
              Choose a product…
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nameEn}
              </option>
            ))}
          </select>
          with discount
          <select
            value={discountMode}
            onChange={(e) => {
              setDiscountMode(e.target.value as EditorRule["discountMode"]);
              setEdited(true);
            }}
            name="discountMode"
            className={selectCls}
            data-testid="rule-mode"
          >
            <option value="fixed">Fixed</option>
            <option value="inherited">Inherit the group&apos;s tier</option>
            <option value="none">None</option>
          </select>
          <Input
            type="number"
            min={1}
            max={90}
            value={discountPct}
            disabled={discountMode !== "fixed"}
            onChange={(e) => {
              setDiscountPct(e.target.value);
              setEdited(true);
            }}
            name="discountPct"
            className="w-16"
            data-testid="rule-pct"
          />
          %
        </p>

        {(state.error || deleteError) && (
          <p role="alert" className="text-sm text-destructive" data-testid="rule-error">
            {state.error || deleteError}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending} data-testid="rule-save">
            {pending ? "Saving…" : "Save rule"}
          </Button>
          {state.notice && !edited && !pending && (
            <span role="status" className="text-sm font-medium text-[var(--primary)]">
              {state.notice}
            </span>
          )}
        </div>
      </form>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2"
        disabled={deletePending}
        onClick={handleDelete}
        data-testid="rule-delete"
      >
        {deletePending ? "Deleting…" : id ? "Delete" : "Remove"}
      </Button>
    </div>
  );
}

export function DiscountRulesEditor({
  initialAutomationsEnabled,
  products,
  initialRules,
}: {
  initialAutomationsEnabled: boolean;
  products: EditorProduct[];
  initialRules: EditorRule[];
}) {
  const idBase = useId();
  const nextSeq = useRef(0);
  const [drafts, setDrafts] = useState<{ key: string; rule: EditorRule }[]>(() =>
    initialRules.map((r) => ({ key: r.id, rule: r }))
  );

  function addRule() {
    setDrafts((ds) => [...ds, { key: `${idBase}-${nextSeq.current++}`, rule: blankRule() }]);
  }
  function removeDraft(key: string) {
    setDrafts((ds) => ds.filter((d) => d.key !== key));
  }

  return (
    <div className="flex flex-col gap-4" data-testid="rules-panel">
      <div>
        <h3 className="mb-1 text-sm font-semibold">🤝 Automations</h3>
        <AutomationsSwitch initialEnabled={initialAutomationsEnabled} />
      </div>
      <p className="text-xs text-muted-foreground">
        Rules you write: “who has X → suggest Y”. On/off per rule, discount on the
        suggested product inherited or fixed. New rules are rows here, no developer
        needed.
      </p>

      {drafts.map((d) => (
        <RuleCard key={d.key} rule={d.rule} products={products} onRemove={() => removeDraft(d.key)} />
      ))}

      <Button type="button" variant="outline" className="self-start" onClick={addRule} data-testid="rule-add">
        Add rule
      </Button>
    </div>
  );
}
