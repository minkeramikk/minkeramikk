"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateText, type TextsState } from "./actions";

export type TextRow = {
  key: string;
  no: string;
  en: string;
  overridden: boolean;
};

/**
 * R4-I18N — search, then edit the row you found.
 *
 * The filter is CLIENT-SIDE over the ~485 strings loaded once (card NOTE N5):
 * it must answer while Iselin types, and 485 rows do not deserve Postgres
 * full-text, an index, a cursor or a network debounce. It matches the
 * EFFECTIVE text — the page already merged files and overrides — in BOTH
 * languages at once, plus the key, which with repeated texts ("Legg til") is
 * the only thing that says which duplicate is being edited.
 *
 * One row at a time is open for editing: the list stays a list, and the two
 * columns get the room they need for `legal.terms.body` (3175 characters).
 */
export function TextsEditor({
  rows,
  disabled,
}: {
  rows: TextRow[];
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<TextsState, FormData>(
    updateText,
    { error: null }
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.key.toLowerCase().includes(needle) ||
        row.no.toLowerCase().includes(needle) ||
        row.en.toLowerCase().includes(needle)
    );
  }, [rows, query]);

  return (
    <div data-testid="texts-editor" className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the texts, in Norwegian or English, or by key…"
          data-testid="texts-search"
          className="max-w-md"
        />
        <span className="text-sm text-muted-foreground tabular-nums">
          {filtered.length} / {rows.length}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {filtered.map((row) => {
          const open = openKey === row.key;
          // The action's state only ever names ONE key (see actions.ts) — a
          // save error on one row can never render under another row's form.
          const rowError = state.key === row.key ? state.error : null;
          return (
            <div key={row.key} data-testid={`row-${row.key}`} className="p-3">
              <button
                type="button"
                onClick={() => setOpenKey(open ? null : row.key)}
                className="flex w-full flex-col items-start gap-1 text-left md:flex-row md:gap-3"
              >
                <code className="w-full font-mono text-xs text-muted-foreground md:w-[240px] md:shrink-0">
                  {row.key}
                </code>
                <span className="min-w-0 w-full truncate text-sm md:w-auto md:flex-1">{row.no}</span>
                <span className="min-w-0 w-full truncate text-sm text-muted-foreground md:w-auto md:flex-1">
                  {row.en}
                </span>
                {row.overridden ? (
                  <span
                    data-testid={`overridden-${row.key}`}
                    className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"
                  >
                    edited
                  </span>
                ) : null}
              </button>

              {open ? (
                <form action={formAction} className="mt-3 flex flex-col gap-3">
                  <input type="hidden" name="key" value={row.key} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium">Norwegian</span>
                      <Textarea
                        name="no"
                        defaultValue={row.no}
                        disabled={disabled}
                        data-testid={`edit-no-${row.key}`}
                        className="max-h-80 overflow-y-auto"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium">English</span>
                      <Textarea
                        name="en"
                        defaultValue={row.en}
                        disabled={disabled}
                        data-testid={`edit-en-${row.key}`}
                        className="max-h-80 overflow-y-auto"
                      />
                    </label>
                  </div>

                  {rowError ? (
                    <p
                      data-testid={`error-${row.key}`}
                      className="text-sm text-destructive"
                    >
                      {rowError}
                    </p>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <Button
                      type="submit"
                      name="intent"
                      value="save"
                      size="sm"
                      disabled={disabled || pending}
                      data-testid={`save-${row.key}`}
                    >
                      Save both languages
                    </Button>
                    <Button
                      type="submit"
                      name="intent"
                      value="reset"
                      size="sm"
                      variant="outline"
                      disabled={disabled || pending || !row.overridden}
                      data-testid={`reset-${row.key}`}
                    >
                      Reset to the shipped text
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
