"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { assetUrl } from "@/lib/storage";
import {
  uploadDesignPhoto,
  reorderDesignPhoto,
  deleteDesignPhoto,
} from "@/app/admin/designs/photo-actions";
import { Button } from "@/components/ui/button";

const MAX = 8;
const MAX_BYTES = 4 * 1024 * 1024; // server bodySizeLimit = 4mb
const TYPES = ["image/png", "image/jpeg", "image/webp"];

export interface DesignPhoto {
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
 * F36: gallery photos shown on the design's public detail page (separate from
 * the configurator compositing layers). Multi-file add uploads one file per
 * server-action call (`uploadDesignPhoto`), ≤2 in flight, with one retry pass
 * for whatever failed — same shape as BulkLayerUpload's job runner.
 */
export function DesignPhotosEditor({
  designId,
  slug,
  photos,
}: {
  designId: string;
  slug: string;
  photos: DesignPhoto[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const full = photos.length >= MAX;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setMsg(null);
    const room = MAX - photos.length;
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
    const upload = async (f: File) => {
      const fd = new FormData();
      fd.set("designId", designId);
      fd.set("slug", slug);
      fd.set("image", f);
      const res = await uploadDesignPhoto({ error: null }, fd);
      if (res.error) failed.push(f);
    };
    await runPool(ok, 2, upload);
    if (failed.length) await runPool(failed, 2, upload); // one retry pass
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
    <div className="space-y-3" data-testid="design-photos-editor">
      <p className="text-xs text-muted-foreground">
        Gallery photos shown on the design&rsquo;s public page. PNG/JPG/WebP, up to 4
        MB each, {MAX} max.
      </p>

      <div className="flex flex-wrap gap-3">
        {photos.map((p, i) => (
          <div key={p.id} className="relative" data-testid="design-photo-thumb">
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
                onClick={() => mutate(() => reorderDesignPhoto(p.id, designId, -1))}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Delete photo"
                data-testid="design-photo-delete"
                className="text-destructive"
                onClick={() => mutate(() => deleteDesignPhoto(p.id, designId))}
              >
                <X className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={i === photos.length - 1}
                aria-label="Move right"
                onClick={() => mutate(() => reorderDesignPhoto(p.id, designId, 1))}
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
        {full ? `Max ${MAX} photos` : "Add photos"}
        <input
          type="file"
          accept={TYPES.join(",")}
          multiple
          className="sr-only"
          data-testid="design-photo-add"
          disabled={full || busy}
          onChange={(e) => onFiles(e.target.files)}
        />
      </label>
      {busy && <p className="text-sm text-muted-foreground">Uploading…</p>}
      {msg && <p className="text-sm text-destructive" data-testid="design-photo-message">{msg}</p>}
    </div>
  );
}
