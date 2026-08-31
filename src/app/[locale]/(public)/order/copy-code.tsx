"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * R4-TAKK — "Kopier" beside the order number. The number is the one thing the
 * customer must carry over into the Vipps message field, so copying it must
 * cost one tap. Clipboard-only (no share sheet): the target is another app's
 * text field, not a share destination.
 */
export function CopyOrderCode({ code }: { code: string }) {
  const t = useTranslations("actions");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      data-testid="order-copy-code"
      className="-mb-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
    >
      <span aria-hidden>⧉</span>
      {copied ? t("copied") : t("copy")}
    </button>
  );
}
