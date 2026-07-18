"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nameClashes } from "@/lib/catalog/clone-product";
import { cloneProductToSupplier, type CloneResult } from "@/app/admin/products/clone-actions";

export interface CloneSupplier {
  id: string;
  name: string;
}

export interface CloneCandidate {
  id: string;
  supplierId: string;
  nameNo: string;
  nameEn: string;
  price: string;
  image: string | null;
}

export function CloneCeramicsPanel({
  suppliers,
  products,
}: {
  suppliers: CloneSupplier[];
  products: CloneCandidate[];
}) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [report, setReport] = useState<CloneResult[] | null>(null);
  const [pending, startTransition] = useTransition();

  const sourceProducts = useMemo(
    () => products.filter((p) => p.supplierId === fromId),
    [products, fromId]
  );

  const filtered = useMemo(() => {
    const v = q.trim().toLowerCase();
    if (!v) return sourceProducts;
    return sourceProducts.filter((p) =>
      `${p.nameEn} ${p.nameNo}`.toLowerCase().includes(v)
    );
  }, [q, sourceProducts]);

  // AC2: warn, never block — the admin may legitimately want a second variant.
  const targetNames = useMemo(
    () => products.filter((p) => p.supplierId === toId).map((p) => p.nameNo),
    [products, toId]
  );
  const clashing = useMemo(
    () =>
      sourceProducts.filter(
        (p) => selected.has(p.id) && nameClashes(p.nameNo, targetNames)
      ),
    [sourceProducts, selected, targetNames]
  );

  const ready = fromId !== "" && toId !== "" && fromId !== toId && selected.size > 0;

  function toggle(id: string) {
    setReport(null);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function pickSource(id: string) {
    setFromId(id);
    setSelected(new Set()); // ids from the old supplier are meaningless now
    setReport(null);
    // Picking the current target as the source drops it from the target list;
    // clear it too, or the select shows blank while state still holds the id.
    if (toId === id) setToId("");
  }

  function run() {
    const ids = sourceProducts.filter((p) => selected.has(p.id)).map((p) => p.id);
    startTransition(async () => {
      // One request per ceramic, sequential (card §2: no batch in one request).
      // Sequential, not Promise.all: each clone reads the slug list and the tail
      // sort_order, so concurrent runs would race on both.
      const out: CloneResult[] = [];
      for (const id of ids) {
        out.push(await cloneProductToSupplier(id, toId));
      }
      setReport(out);
      setSelected(new Set());
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4" data-testid="clone-ceramics">
      <p className="text-sm text-muted-foreground">
        Copy ceramics from one supplier to another. Copies land hidden, at the
        end of the target supplier&apos;s list, sharing the original photo —
        upload a new photo on either one and they stop sharing it.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          From supplier
          <select
            value={fromId}
            onChange={(e) => pickSource(e.target.value)}
            data-testid="clone-from"
            className="h-9 rounded-lg border border-border bg-card px-2 text-sm font-normal"
          >
            <option value="">Choose…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          To supplier
          <select
            value={toId}
            onChange={(e) => { setToId(e.target.value); setReport(null); }}
            data-testid="clone-to"
            className="h-9 rounded-lg border border-border bg-card px-2 text-sm font-normal"
          >
            <option value="">Choose…</option>
            {suppliers.filter((s) => s.id !== fromId).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
      </div>

      {fromId && (
        <div className="flex flex-col gap-2" data-testid="clone-picker">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search ceramics…"
                className="pl-8"
                data-testid="clone-search"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelected((s) => { const n = new Set(s); filtered.forEach((p) => n.add(p.id)); return n; })}
              data-testid="clone-select-all"
            >
              Select all
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setSelected(new Set())} data-testid="clone-clear">
              Clear
            </Button>
          </div>

          <p className="text-xs text-muted-foreground" data-testid="clone-counter">
            <b className="text-foreground">{selected.size}</b> of {sourceProducts.length} ceramics selected
          </p>

          <div className="max-h-80 overflow-y-auto rounded-sm border border-border">
            {filtered.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-muted/40"
                data-testid="clone-row"
              >
                <input
                  // remount on flip — controlled-checkbox desync guard (F34)
                  key={selected.has(p.id) ? "on" : "off"}
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  data-testid="clone-row-check"
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
                <span className="text-xs text-muted-foreground">{p.price}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {clashing.length > 0 && (
        <p role="status" className="rounded-sm bg-muted px-3 py-2 text-xs" data-testid="clone-name-warning">
          {clashing.length === 1
            ? `“${clashing[0].nameNo}” already exists for the target supplier — cloning it makes a second one.`
            : `${clashing.length} of the selected ceramics already exist for the target supplier — cloning makes duplicates.`}
        </p>
      )}

      <div>
        <Button
          type="button"
          size="lg"
          className="min-h-11"
          disabled={!ready || pending}
          onClick={run}
          data-testid="clone-run"
        >
          {pending ? "Cloning…" : `Clone ${selected.size} ceramic${selected.size === 1 ? "" : "s"}`}
        </Button>
      </div>

      {report && (
        <ul className="flex flex-col gap-1 rounded-sm border border-border p-3 text-sm" data-testid="clone-report">
          {report.map((r, i) => (
            <li key={i} data-testid={r.ok ? "clone-report-ok" : "clone-report-fail"}>
              {r.ok ? (
                <span className="text-[var(--primary)]">✓ {r.name} cloned (hidden)</span>
              ) : (
                <span className="text-destructive">
                  ✕ {r.name} — {r.error}
                  {r.id && (
                    <>
                      {" "}
                      <Link
                        href={`/admin/products/${r.id}`}
                        data-testid="clone-report-edit"
                        className="underline underline-offset-2"
                      >
                        Edit
                      </Link>
                    </>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
