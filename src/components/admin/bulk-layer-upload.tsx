"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { matchPalette } from "@/lib/catalog/parse-layer-filename";
import {
  bulkUpsertOptionLayer,
  finalizeBulk,
  type BulkLayerState,
} from "@/app/admin/designs/bulk-layer-actions";
import type { PaletteColour } from "@/components/admin/design-tree";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 2 * 1024 * 1024; // client guard: 2 MB (server bodySizeLimit = 4 MB)
const TYPES = ["image/png", "image/jpeg", "image/webp"];

type RowStatus = "match" | "duplicate" | "no-hex" | "not-in-palette" | "too-big" | "bad-type";

interface PreviewRow {
  file: File;
  hex: string | null;
  colour: PaletteColour | null;
  status: RowStatus;
}

type JobStatus = "pending" | "uploading" | "created" | "updated" | "failed";
interface Job {
  /** stable identity across state replacements (needed for the retry pass) */
  key: number;
  file: File;
  colour: PaletteColour;
  status: JobStatus;
  error?: string;
}

const STATUS_LABEL: Record<RowStatus, string> = {
  match: "match",
  duplicate: "duplicate — skipped",
  "no-hex": "no #hex in name",
  "not-in-palette": "hex not in palette",
  "too-big": "over 2 MB",
  "bad-type": "not PNG/JPG/WebP",
};

/** Run `worker` over items with at most `limit` in flight. */
async function runPool<T>(items: T[], limit: number, worker: (item: T, i: number) => Promise<void>) {
  let idx = 0;
  async function next(): Promise<void> {
    const i = idx++;
    if (i >= items.length) return;
    await worker(items[i], i);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
}

export function BulkLayerUpload({
  categoryId,
  designId,
  palette,
}: {
  categoryId: string;
  designId: string;
  palette: PaletteColour[];
}) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const byHex = useMemo(() => new Map(palette.map((c) => [c.hex, c])), [palette]);

  // Preview: filename→palette match + client size/type guard, per file.
  const { rows, uncovered } = useMemo(() => {
    const invalid = new Map<string, RowStatus>();
    for (const f of files) {
      if (f.size > MAX_BYTES) invalid.set(f.name, "too-big");
      else if (!TYPES.includes(f.type)) invalid.set(f.name, "bad-type");
    }
    const m = matchPalette(
      files.map((f) => ({ name: f.name })),
      palette.map((c) => ({ hex: c.hex }))
    );
    const matchedHex = new Map(m.matched.map((x) => [x.name, x.hex]));
    const dupNames = new Set(m.duplicates.map((x) => x.name));
    const noHex = new Set(m.unmatched.filter((x) => x.reason === "no-hex").map((x) => x.name));

    const rows: PreviewRow[] = files.map((f) => {
      const bad = invalid.get(f.name);
      if (bad) return { file: f, hex: null, colour: null, status: bad };
      if (matchedHex.has(f.name)) {
        const hex = matchedHex.get(f.name)!;
        return { file: f, hex, colour: byHex.get(hex) ?? null, status: "match" };
      }
      if (dupNames.has(f.name)) return { file: f, hex: null, colour: null, status: "duplicate" };
      if (noHex.has(f.name)) return { file: f, hex: null, colour: null, status: "no-hex" };
      return { file: f, hex: null, colour: null, status: "not-in-palette" };
    });

    const uncovered = m.uncoveredPaletteHexes
      .map((h) => byHex.get(h))
      .filter((c): c is PaletteColour => Boolean(c));
    return { rows, uncovered };
  }, [files, palette, byHex]);

  const importable = rows.filter((r) => r.status === "match" && r.colour);
  const skipped = rows.length - importable.length;

  function onPick(list: FileList | null) {
    setDone(false);
    setJobs(null);
    setFiles(list ? Array.from(list) : []);
  }

  /** Upload each job (≤2 in flight); returns the jobs that failed (for one retry). */
  async function runJobs(list: Job[]): Promise<Job[]> {
    const failed: Job[] = [];
    await runPool(list, 2, async (job) => {
      setJobs((prev) => prev!.map((j) => (j.key === job.key ? { ...j, status: "uploading" } : j)));
      const fd = new FormData();
      fd.set("categoryId", categoryId);
      fd.set("designId", designId);
      fd.set("supplierColorId", job.colour.id);
      fd.set("file", job.file);
      let res: BulkLayerState;
      try {
        res = await bulkUpsertOptionLayer({ error: null }, fd);
      } catch {
        res = { error: "Upload failed." };
      }
      const status: JobStatus = res.error ? "failed" : res.created ? "created" : "updated";
      setJobs((prev) =>
        prev!.map((j) => (j.key === job.key ? { ...j, status, error: res.error ?? undefined } : j))
      );
      if (res.error) failed.push(job);
    });
    return failed;
  }

  async function proceed() {
    const initial: Job[] = importable.map((r, i) => ({
      key: i,
      file: r.file,
      colour: r.colour!,
      status: "pending",
    }));
    setJobs(initial);
    setRunning(true);
    const failed = await runJobs(initial);
    if (failed.length) await runJobs(failed.map((j) => ({ ...j, status: "pending" }))); // one retry
    await finish();
  }

  async function finish() {
    await finalizeBulk(designId);
    setRunning(false);
    setDone(true);
    router.refresh();
  }

  return (
    <div
      data-testid="bulk-layer-upload"
      className="mt-2 rounded-sm border border-dashed border-border p-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onPick(e.dataTransfer.files);
      }}
    >
      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-sm border border-dashed border-primary/50 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Drop layer files here, or click to choose</span>
        <span className="text-xs">
          The <code>#hex</code> in each filename is matched to this supplier’s palette.
        </span>
        <input
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          data-testid="bulk-file-input"
          onChange={(e) => onPick(e.target.files)}
        />
      </label>

      {rows.length > 0 && !jobs && (
        <div className="mt-3">
          <div className="overflow-hidden rounded-sm border border-border">
            {rows.map((r, i) => (
              <div
                key={`${r.file.name}-${i}`}
                data-testid="bulk-preview-row"
                data-status={r.status}
                className="flex items-center gap-2 border-b border-border px-2 py-1.5 text-xs last:border-0"
              >
                {r.colour ? (
                  <ColourDot colour={r.colour} />
                ) : (
                  <span className="size-4 shrink-0 rounded-full border border-border bg-muted" />
                )}
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                  {r.file.name}
                </span>
                {r.colour && <span className="shrink-0 text-foreground">→ {r.colour.name}</span>}
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    r.status === "match"
                      ? "bg-emerald-500/15 text-emerald-700"
                      : r.status === "duplicate"
                        ? "bg-amber-500/15 text-amber-700"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {r.status === "match" ? "✓ " : r.status === "duplicate" ? "⚠ " : "✗ "}
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-3">
            <span className="text-sm">
              <b>{importable.length}</b> to import · {skipped} skipped
            </span>
            <Button
              type="button"
              size="sm"
              disabled={importable.length === 0}
              onClick={proceed}
              data-testid="bulk-proceed"
              className="ml-auto"
            >
              Import {importable.length} layer{importable.length === 1 ? "" : "s"}
            </Button>
          </div>
          <UncoveredWarning uncovered={uncovered} />
        </div>
      )}

      {jobs && (
        <div className="mt-3" data-testid="bulk-progress">
          <div className="overflow-hidden rounded-sm border border-border">
            {jobs.map((j) => (
              <div
                key={j.key}
                className="flex items-center gap-2 border-b border-border px-2 py-1.5 text-xs last:border-0"
              >
                <ColourDot colour={j.colour} />
                <span className="min-w-0 flex-1 truncate">{j.colour.name}</span>
                <span
                  className={`shrink-0 text-[10px] font-medium ${
                    j.status === "failed"
                      ? "text-destructive"
                      : j.status === "created" || j.status === "updated"
                        ? "text-emerald-700"
                        : "text-muted-foreground"
                  }`}
                >
                  {j.status === "created" ? "✓ created" : j.status === "updated" ? "✓ updated" : j.status === "failed" ? `✗ ${j.error ?? "failed"}` : j.status === "uploading" ? "…" : "queued"}
                </span>
              </div>
            ))}
          </div>

          {done && (
            <div className="mt-2" data-testid="bulk-report">
              <p className="text-sm font-medium text-emerald-700">
                {jobs.filter((j) => j.status === "created").length} created ·{" "}
                {jobs.filter((j) => j.status === "updated").length} updated
                {jobs.some((j) => j.status === "failed") &&
                  ` · ${jobs.filter((j) => j.status === "failed").length} failed`}
              </p>
              <UncoveredWarning uncovered={uncovered} />
            </div>
          )}
          {running && <p className="mt-2 text-xs text-muted-foreground">Uploading… (2 at a time)</p>}
        </div>
      )}
    </div>
  );
}

function ColourDot({ colour }: { colour: PaletteColour }) {
  return colour.swatchUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- storage art
    <img src={colour.swatchUrl} alt="" className="size-4 shrink-0 rounded-full border border-border object-cover" />
  ) : (
    <span
      aria-hidden
      className="size-4 shrink-0 rounded-full border border-border"
      style={{ backgroundColor: colour.hex }}
    />
  );
}

/** Honest report bit: palette colours NOT covered by this batch (e.g. #001c81). */
function UncoveredWarning({ uncovered }: { uncovered: PaletteColour[] }) {
  if (uncovered.length === 0) return null;
  return (
    <div
      data-testid="bulk-uncovered"
      className="mt-2 rounded-sm border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-800"
    >
      <p className="font-medium">
        {uncovered.length} palette colour{uncovered.length === 1 ? "" : "s"} not covered by this batch:
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        {uncovered.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <ColourDot colour={c} />
            {c.name} <span className="font-mono text-[10px] opacity-70">{c.hex}</span>
          </span>
        ))}
      </div>
      <p className="mt-1 opacity-80">
        If intentional (this design has no layer in that colour), ignore. Otherwise add the file and re-drop.
      </p>
    </div>
  );
}
