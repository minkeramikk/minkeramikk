"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * F36 step-2: design description. Desktop always shows full text; mobile
 * clamps to 3 lines and only shows a "Vis mer/Vis mindre" toggle when the
 * text actually overflows the clamp (measured via scrollHeight after mount).
 *
 * R4-BUGS-C1 Ⓔ, revised (TL feedback 25/9): `clamp="always"` used to be what
 * `ProductSheet` needed too, so a long description wouldn't push the buy row
 * off screen. `ProductSheet` no longer uses this component — it opens/closes
 * its description in full via a native <details> toggle instead, so
 * `clamp="always"` is unused there now. Step 2 keeps its own mobile-only
 * clamp, unchanged.
 */
export function DesignDescription({
  text,
  clamp = "mobile",
  testId,
}: {
  text: string;
  clamp?: "mobile" | "always";
  /** The caller's own hook for tests — the paragraph is what they look for. */
  testId?: string;
}) {
  const t = useTranslations("configurator.step2");
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) setOverflows(el.scrollHeight - el.clientHeight > 1);
  }, [text]);

  return (
    <div>
      <p
        ref={ref}
        data-testid={testId}
        className={
          "text-sm leading-relaxed text-muted-foreground" +
          // "mobile": clamp below sm only, desktop shows the full text
          (!expanded ? (clamp === "always" ? " line-clamp-3" : " line-clamp-3 sm:line-clamp-none") : "")
        }
      >
        {text}
      </p>
      {/* toggle only when the clamp actually hides text (TODO:nb-review NO copy: showMore/showLess) */}
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={
            "mt-1 text-sm font-medium text-[var(--mk-accent)]" +
            (clamp === "always" ? "" : " sm:hidden")
          }
        >
          {expanded ? t("showLess") : t("showMore")}
        </button>
      )}
    </div>
  );
}
