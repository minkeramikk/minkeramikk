"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { assetUrl } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import type { PhotoState } from "@/app/admin/designs/photo-actions";

const MAX_BYTES = 4 * 1024 * 1024; // server bodySizeLimit = 4mb
const TYPES = ["image/png", "image/jpeg", "image/webp"];

export interface GalleryPhoto {
  id: string;
  image: string;
}

/** Run `worker` over items with at most `limit` in flight (mirrors bulk-layer-upload). */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) await worker(queue.shift()!);
    })
  );
}

/**
 * F36 / R4-STEP3: gallery photos editor, shared by designs (max 8) and
 * products (max 2). Multi-file add uploads one file per server-action call,
 * ≤2 in flight, with one retry pass for whatever failed — same shape as
 * BulkLayerUpload's job runner. Owner-specific behaviour (max, copy, testids,
 * the three mutations) comes in as props so there is exactly one editor
 * implementation for both galleries.
 */
export function PhotosEditor({
  ownerId,
  slug,
  photos,
  max,
  testIdPrefix,
  hint,
  upload,
  reorder,
  remove,
}: {
  ownerId: string;
  slug: string;
  photos: GalleryPhoto[];
  max: number;
  testIdPrefix: string;
  hint: string;
  upload: (prev: PhotoState, fd: FormData) => Promise<PhotoState>;
  reorder: (id: string, ownerId: string, dir: -1 | 1) => Promise<void>;
  remove: (id: string, ownerId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const full = photos.length >= max;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setMsg(null);
    const room = max - photos.length;
    const picked = Array.from(files).slice(0, room);
    const ok = picked.filter((f) => TYPES.includes(f.type) && f.size <= MAX_BYTES);
    const skippedInvalid = picked.length - ok.length;
    const notes: string[] = [];
    if (skippedInvalid > 0) {
      notes.push("Skipped files over 4 MB or not PNG/JPG/WebP — export for web first.");
    }
    if (files.length > room) notes.push(`Only ${room} slot(s) left.`);
    if (notes.length) setMsg(notes.join(" "));
    if (!ok.length) return;

    setBusy(true);
    const failed: File[] = [];
    const doUpload = async (f: File) => {
      const fd = new FormData();
      fd.set("ownerId", ownerId);
      fd.set("slug", slug);
      fd.set("image", f);
      const res = await upload({ error: null }, fd);
      if (res.error) failed.push(f);
    };
    await runPool(ok, 2, doUpload);
    if (failed.length) await runPool(failed, 2, doUpload); // one retry pass
    setBusy(false);
    if (failed.length) setMsg((m) => (m ? m + " " : "") + `${failed.length} upload(s) failed.`);
    router.refresh();
  }

  const mutate = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="space-y-3" data-testid={`${testIdPrefix}s-editor`}>
      <p className="text-xs text-muted-foreground">{hint}</p>

      <div className="flex flex-wrap gap-3">
        {photos.map((p, i) => (
          <div key={p.id} className="relative" data-testid={`${testIdPrefix}-thumb`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- storage art */}
            <img
              src={assetUrl(p.image)}
              alt=""
              className="size-24 rounded-md border border-border object-cover"
            />
            <div className="mt-1 flex items-center justify-between gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={i === 0}
                aria-label="Move left"
                onClick={() => mutate(() => reorder(p.id, ownerId, -1))}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Delete photo"
                data-testid={`${testIdPrefix}-delete`}
                className="text-destructive"
                onClick={() => mutate(() => remove(p.id, ownerId))}
              >
                <X className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={i === photos.length - 1}
                aria-label="Move right"
                onClick={() => mutate(() => reorder(p.id, ownerId, 1))}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <label
        className="inline-flex h-7 cursor-pointer items-center rounded-[min(var(--radius-md),12px)] border border-border px-2.5 text-[0.8rem] font-medium hover:bg-muted has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50"
      >
        {full ? `Max ${max} photos` : "Add photos"}
        <input
          type="file"
          accept={TYPES.join(",")}
          multiple
          className="sr-only"
          data-testid={`${testIdPrefix}-add`}
          disabled={full || busy}
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>
      {busy && <p className="text-sm text-muted-foreground">Uploading…</p>}
      {msg && (
        <p className="text-sm text-destructive" data-testid={`${testIdPrefix}-message`}>
          {msg}
        </p>
      )}
    </div>
  );
}
