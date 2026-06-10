"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * File input with an inline thumbnail (admin). Shows the currently-stored image
 * (`existingSrc`) and, as soon as a file is chosen, a live preview of it
 * (object URL) — so you see what you're uploading before saving. The hidden
 * `value` isn't controlled, so the file still reaches the server action's
 * FormData under `name`.
 */
export function FileThumbInput({
  name,
  existingSrc,
  accept = "image/png,image/jpeg,image/webp",
  testid,
  className,
}: {
  name: string;
  existingSrc?: string | null;
  accept?: string;
  testid?: string;
  className?: string;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const src = chosen ?? existingSrc ?? null;

  return (
    <div className={cn("mt-1 flex items-center gap-2", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL or storage art
        <img
          src={src}
          alt=""
          data-testid={testid ? `${testid}-thumb` : undefined}
          className="size-10 shrink-0 rounded border border-border bg-card object-contain"
        />
      ) : (
        <span
          aria-hidden
          className="size-10 shrink-0 rounded border border-dashed border-border"
        />
      )}
      <Input
        name={name}
        type="file"
        accept={accept}
        data-testid={testid}
        className="text-xs"
        onChange={(e) => {
          const file = e.target.files?.[0];
          setChosen((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return file ? URL.createObjectURL(file) : null;
          });
        }}
      />
    </div>
  );
}
