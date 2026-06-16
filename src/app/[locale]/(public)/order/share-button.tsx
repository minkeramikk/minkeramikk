"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * F30-B: share the CA-3 "reopen your set" link. Uses the native share sheet
 * where available (mobile), else copies to the clipboard with feedback. Inert
 * when there's nothing to share.
 */
export function OrderShareButton({ url }: { url: string }) {
  const t = useTranslations("order");
  const [copied, setCopied] = useState(false);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        /* user dismissed or unsupported → fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="rounded-mk px-8"
      data-testid="order-share"
      onClick={share}
    >
      {copied ? t("shareCopied") : t("shareCta")}
    </Button>
  );
}
