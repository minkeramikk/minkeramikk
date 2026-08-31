"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * R4-TAKK — "Kopier" next to a value the customer has to carry into the Vipps
 * app by hand: the order number (into the «melding» field) and, on mobile, the
 * Vipps number itself, since you cannot scan a QR shown by the phone you are
 * holding. Clipboard-only, no share sheet: the target is another app's text
 * field, not a share destination.
 *
 * This is the ONE action the payment block is allowed to carry. It copies a
 * datum; it does not start a payment (TL ruling, 2026-08-30).
 */
export function CopyValue({
  value,
  testId,
  className,
}: {
  value: string;
  testId: string;
  className?: string;
}) {
  const t = useTranslations("actions");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
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
      data-testid={testId}
      className={
        "inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-primary underline-offset-2 hover:underline " +
        (className ?? "")
      }
    >
      <span aria-hidden>⧉</span>
      {copied ? t("copied") : t("copy")}
    </button>
  );
}
