"use client";

import { useActionState, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** One selectable product in the picker (price pre-formatted server-side). */
export interface EditorProduct {
  id: string;
  nameNo: string;
  nameEn: string;
  price: string;
  image: string | null; // resolved URL (assetUrl) or null
  visible: boolean;
}

/** Shared shape every consumer's server action must return — the picker only
 *  needs an error to show and an `ok` flag to flash the "Saved" badge. */
export interface PickerState {
  error: string | null;
  ok?: boolean;
}

export interface PickerLabels {
  intro: string;
  allTitle: string;
  allDesc: string;
  someTitle: string;
  someDesc: string;
  searchPlaceholder: string;
  /** Rendered as `{n} of {total} {counterSuffix}`. */
  counterSuffix: string;
  emptyHint: string;
  saveLabel: string;
  savingLabel: string;
  footnote?: string;
}

const initial: PickerState = { error: null };

/**
 * Generalised picker lifted from `design-products-editor.tsx` (F34): search box,
 * toggle chips, "select all filtered", `all`/`some` radio. The action, the extra
 * hidden fields (e.g. `designId`) and every piece of copy are props so the same
 * DOM/behaviour serves more than one admin form (R4-SCONTI Task 7).
 */
export function ProductMultiSelect({
  action,
  extraFields = {},
  products,
  initialSelectedIds,
  labels,
  formTestId,
  testIdPrefix,
}: {
  action: (prevState: PickerState, formData: FormData) => Promise<PickerState>;
  extraFields?: Record<string, string>;
  products: EditorProduct[];
  initialSelectedIds: string[];
  labels: PickerLabels;
  formTestId: string;
  testIdPrefix: string;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [mode, setMode] = useState<"all" | "some">(
    initialSelectedIds.length > 0 ? "some" : "all"
  );
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds));
  const [q, setQ] = useState("");
  // hides the "Saved" badge as soon as the selection is touched again
  const [edited, setEdited] = useState(false);

  const filtered = useMemo(() => {
    const v = q.trim().toLowerCase();
    if (!v) return products;
    return products.filter((p) =>
      `${p.nameEn} ${p.nameNo}`.toLowerCase().includes(v)
    );
  }, [q, products]);

  const total = products.length;
  const nSel = selected.size;
  const empty = mode === "some" && nSel === 0;

  function toggle(id: string) {
    setEdited(true);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function selectAllFiltered() {
    setEdited(true);
    setSelected((s) => {
      const n = new Set(s);
      filtered.forEach((p) => n.add(p.id));
      return n;
    });
  }

  const t = (suffix: string) => `${testIdPrefix}-${suffix}`;

  return (
    <form
      action={formAction}
      onSubmit={() => setEdited(false)}
      data-testid={formTestId}
      className="flex max-w-lg flex-col gap-3"
    >
      {Object.entries(extraFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="mode" value={mode} />
      <input
        type="hidden"
        name="productIds"
        value={JSON.stringify(mode === "some" ? [...selected] : [])}
      />

      <p className="text-xs text-muted-foreground">{labels.intro}</p>

      {/* radios */}
      <label className="flex cursor-pointer items-start gap-2 rounded-sm border border-border p-3 has-[:checked]:border-[var(--primary)]">
        <input
          // same controlled-input desync guard as the checkboxes below: remount
          // on flip so the DOM radio matches state after a useActionState submit.
          key={mode === "all" ? "on" : "off"}
          type="radio"
          name="mode-ui"
          className="mt-0.5 accent-[var(--primary)]"
          checked={mode === "all"}
          onChange={() => { setMode("all"); setEdited(true); }}
          data-testid={t("mode-all")}
        />
        <span>
          <span className="block text-sm font-medium">{labels.allTitle}</span>
          <span className="block text-xs text-muted-foreground">{labels.allDesc}</span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-2 rounded-sm border border-border p-3 has-[:checked]:border-[var(--primary)]">
        <input
          key={mode === "some" ? "on" : "off"}
          type="radio"
          name="mode-ui"
          className="mt-0.5 accent-[var(--primary)]"
          checked={mode === "some"}
          onChange={() => { setMode("some"); setEdited(true); }}
          data-testid={t("mode-some")}
        />
        <span>
          <span className="block text-sm font-medium">{labels.someTitle}</span>
          <span className="block text-xs text-muted-foreground">{labels.someDesc}</span>
        </span>
      </label>

      {/* picker */}
      {mode === "some" && (
        <div className="flex flex-col gap-2" data-testid={t("picker")}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={labels.searchPlaceholder}
                className="pl-8"
                data-testid={t("search")}
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={selectAllFiltered} data-testid={t("select-all")}>
              Select all
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setEdited(true); setSelected(new Set()); }} data-testid={t("clear")}>
              Clear
            </Button>
          </div>

          <p className="text-xs text-muted-foreground" data-testid={t("counter")}>
            <b className="text-foreground">{nSel}</b> of {total} {labels.counterSuffix}
          </p>

          <div className="max-h-80 overflow-y-auto rounded-sm border border-border">
            {filtered.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-muted/40"
                data-testid={t("row")}
              >
                <input
                  // key includes checked state: after a useActionState submit,
                  // React can skip writing .checked to a controlled checkbox
                  // (DOM stays unticked while React thinks it's ticked → the
                  // "must refresh to see it" bug). Keying on the value forces a
                  // fresh DOM node whenever it flips, so DOM always matches state.
                  key={selected.has(p.id) ? "on" : "off"}
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  data-testid={t("row-check")}
                />
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- catalog art from storage
                  <img src={p.image} alt="" className="size-9 rounded-full border border-border object-cover" />
                ) : (
                  <span className="size-9 rounded-full border border-border bg-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.nameEn}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.nameNo}</span>
                </span>
                {!p.visible && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    hidden
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{p.price}</span>
              </label>
            ))}
          </div>

          {empty && (
            <p role="alert" className="rounded-sm bg-destructive/10 px-3 py-2 text-xs text-destructive" data-testid={t("empty-hint")}>
              {labels.emptyHint}
            </p>
          )}
        </div>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-destructive" data-testid={t("error")}>
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" className="min-h-11" disabled={pending || empty} data-testid={t("save")}>
          {pending ? labels.savingLabel : labels.saveLabel}
        </Button>
        {state.ok && !edited && !pending && (
          <span className="text-sm font-medium text-[var(--primary)]" data-testid={t("saved")} role="status">
            Saved ✓
          </span>
        )}
      </div>
      {labels.footnote && (
        <p className="text-xs text-muted-foreground">{labels.footnote}</p>
      )}
    </form>
  );
}
