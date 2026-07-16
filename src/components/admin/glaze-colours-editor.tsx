"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import {
  saveSupplierColors,
  type PaletteFormState,
} from "@/app/admin/suppliers/palette-actions";
import { parsePaletteImport, mergeResolvedRows } from "@/lib/catalog/palette-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileThumbInput } from "@/components/admin/file-thumb-input";

/** One glaze colour as loaded into the editor. */
export interface GlazeColour {
  id: string;
  hex: string;
  name: string;
  active: boolean;
  swatchImage: string | null; // stored Storage path
  swatchUrl: string | null; // resolved assetUrl for the thumb
  usedByDesigns: number; // how many designs reference it (safety before removal)
}

interface Row {
  key: string;
  /** DB id. The client mints one for new rows too (so the atomic replace keeps a
   *  stable id and the editor can reconcile after saving). key === id in practice. */
  id: string;
  hex: string;
  name: string;
  active: boolean;
  swatchImage: string | null;
  swatchUrl: string | null;
  usedByDesigns: number;
}

const initial: PaletteFormState = { error: null };
const HEX_RE = /^#[0-9a-f]{6}$/i;

function newKey() {
  return crypto.randomUUID();
}

export function GlazeColoursEditor({
  supplierId,
  colours,
}: {
  supplierId: string;
  colours: GlazeColour[];
}) {
  const [state, formAction, pending] = useActionState(saveSupplierColors, initial);
  const [rows, setRows] = useState<Row[]>(() =>
    colours.map((c) => ({ key: c.id, ...c }))
  );
  const [importText, setImportText] = useState("");
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [edited, setEdited] = useState(false);

  // After a successful save, reconcile client state with what the server wrote:
  // new rows get their persisted id, and swatch paths become the token'd ones —
  // so a second save (no reload) reuses the ids and keeps the uploaded swatches.
  useEffect(() => {
    if (state.ok && state.resolved) {
      const resolved = state.resolved;
      setRows((rs) => mergeResolvedRows(rs, resolved));
    }
  }, [state]);

  function patch(key: string, next: Partial<Row>) {
    setEdited(true);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...next } : r)));
  }
  function move(key: string, dir: -1 | 1) {
    setEdited(true);
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= rs.length) return rs;
      const n = [...rs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  }
  function remove(key: string) {
    setEdited(true);
    setRows((rs) => rs.filter((r) => r.key !== key));
  }
  function addRow() {
    setEdited(true);
    const k = newKey();
    setRows((rs) => [
      ...rs,
      { key: k, id: k, hex: "", name: "", active: true, swatchImage: null, swatchUrl: null, usedByDesigns: 0 },
    ]);
  }
  function runImport() {
    const { rows: parsed, errors } = parsePaletteImport(importText);
    setImportErrors(errors);
    if (parsed.length === 0) return;
    setEdited(true);
    setRows((rs) => [
      ...rs,
      ...parsed.map((p) => {
        const k = newKey();
        return {
          key: k,
          id: k,
          hex: p.hex,
          name: p.name,
          active: true,
          swatchImage: null,
          swatchUrl: null,
          usedByDesigns: 0,
        };
      }),
    ]);
    setImportText("");
  }

  const payload = rows.map((r, i) => ({
    key: r.key,
    id: r.id,
    hex: r.hex.trim().toLowerCase(),
    name: r.name.trim(),
    active: r.active,
    sortOrder: i,
    swatchImage: r.swatchImage,
  }));

  return (
    <form
      action={formAction}
      onSubmit={() => setEdited(false)}
      data-testid="glaze-colours-editor"
      className="mt-8 flex max-w-2xl flex-col gap-3"
    >
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="rows" value={JSON.stringify(payload)} />

      <div>
        <h2 className="text-base font-semibold">Glaze colours</h2>
        <p className="text-xs text-muted-foreground">
          Name, hex and glaze photo live here once. Designs reference them without
          re-uploading — rename a colour and it changes everywhere.
        </p>
      </div>

      <div className="rounded-sm border border-border">
        {rows.length === 0 && (
          <p className="px-3 py-4 text-sm text-muted-foreground" data-testid="gc-empty">
            No glaze colours yet. Add the lab’s colours below — designs will pick
            from them.
          </p>
        )}
        {rows.map((r) => {
          const hexBad = r.hex.trim() !== "" && !HEX_RE.test(r.hex.trim());
          return (
            <div
              key={r.key}
              data-testid="gc-row"
              className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"
            >
              <span
                aria-hidden
                className="size-6 shrink-0 rounded-full border border-border"
                style={{ background: HEX_RE.test(r.hex.trim()) ? r.hex.trim() : "transparent" }}
              />
              <Input
                value={r.hex}
                onChange={(e) => patch(r.key, { hex: e.target.value })}
                placeholder="#rrggbb"
                aria-label="Hex"
                data-testid="gc-hex"
                className={`w-28 font-mono text-xs ${hexBad ? "border-destructive" : ""}`}
              />
              <Input
                value={r.name}
                onChange={(e) => patch(r.key, { name: e.target.value })}
                placeholder="Colour name"
                aria-label="Name"
                data-testid="gc-name"
                className="min-w-36 flex-1 text-sm"
              />
              <FileThumbInput
                // remount when the stored swatch changes (post-save reconcile):
                // drops the stale object-URL preview and shows the new stored image.
                key={`swatch-${r.key}-${r.swatchImage ?? "none"}`}
                name={`swatch-${r.key}`}
                existingSrc={r.swatchUrl}
                testid="gc-swatch"
                className="mt-0 w-40"
              />
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  // F34 desync guard: remount the checkbox when its state flips so
                  // the DOM matches React after a useActionState submit.
                  key={`${r.key}-${r.active}`}
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={r.active}
                  onChange={(e) => patch(r.key, { active: e.target.checked })}
                  data-testid="gc-active"
                />
                active
              </label>
              {r.usedByDesigns > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  used in {r.usedByDesigns} design{r.usedByDesigns === 1 ? "" : "s"}
                </span>
              )}
              <div className="flex items-center">
                <Button type="button" variant="ghost" size="icon" onClick={() => move(r.key, -1)} aria-label="Move up" className="size-7">
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => move(r.key, 1)} aria-label="Move down" className="size-7">
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(r.key)} aria-label="Remove" data-testid="gc-remove" className="size-7 text-destructive">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow} data-testid="gc-add" className="self-start">
        + Add colour
      </Button>

      <details className="rounded-sm border border-border px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          Paste-import (one <code>#hex;Name</code> per line)
        </summary>
        <Textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={"#0160b2;Blu Antico\n#facf27;Giallo"}
          rows={4}
          data-testid="gc-import-text"
          className="mt-2 font-mono text-xs"
        />
        {importErrors.length > 0 && (
          <ul className="mt-1 text-xs text-destructive" data-testid="gc-import-errors">
            {importErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        <Button type="button" variant="outline" size="sm" onClick={runImport} data-testid="gc-import" className="mt-2">
          Add these lines
        </Button>
      </details>

      {state.error && (
        <p role="alert" className="text-sm text-destructive" data-testid="gc-error">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" className="min-h-11" disabled={pending} data-testid="gc-save">
          {pending ? "Saving…" : "Save palette"}
        </Button>
        {state.ok && !edited && !pending && (
          <span className="text-sm font-medium text-[var(--primary)]" data-testid="gc-saved" role="status">
            Saved ✓
          </span>
        )}
      </div>
    </form>
  );
}
