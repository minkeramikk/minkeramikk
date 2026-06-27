"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * F04 — the canonical config code (ADR 0011): copy the code, copy a deep link,
 * or paste a code to reconstruct the configuration. Pure presentational: the
 * parent owns encode (passes `code`) and decode (`onApply` → updates the URL).
 */
export function ConfigCodeBar({
  code,
  shareUrl,
  onApply,
}: {
  code: string;
  /** absolute deep link to the current configuration */
  shareUrl: string;
  /** paste handler: returns true if the code was understood, false otherwise */
  onApply?: (raw: string) => boolean;
}) {
  const t = useTranslations("configurator.code");
  const ta = useTranslations("actions");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState(false);

  async function copy(text: string, which: "code" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  function apply() {
    if (!onApply || !paste.trim()) return;
    const ok = onApply(paste);
    setError(!ok);
    if (ok) setPaste("");
  }

  return (
    <section
      data-testid="config-code-bar"
      className="rounded-lg border bg-card p-3"
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em]">
        {t("title")}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <code
          data-testid="config-code"
          className="rounded-sm bg-muted px-2 py-1 font-mono text-sm"
        >
          {code}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="copy-code"
          onClick={() => copy(code, "code")}
        >
          {copied === "code" ? ta("copied") : ta("copyCode")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="copy-link"
          onClick={() => copy(shareUrl, "link")}
        >
          {copied === "link" ? ta("copied") : t("copyLink")}
        </Button>
      </div>

      {onApply && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            {t("pasteLabel")}
            <Input
              value={paste}
              onChange={(e) => {
                setPaste(e.target.value);
                setError(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              placeholder="MK-…"
              aria-invalid={error}
              data-testid="paste-input"
              className="mt-1 font-mono"
            />
          </label>
          <Button
            type="button"
            size="sm"
            data-testid="paste-apply"
            onClick={apply}
          >
            {t("pasteApply")}
          </Button>
        </div>
      )}

      {error ? (
        <p data-testid="paste-error" className="mt-2 text-xs text-destructive">
          {t("pasteError")}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{t("help")}</p>
      )}
    </section>
  );
}
