"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * F36 step-2: design description. Desktop always shows full text; mobile
 * clamps to 3 lines and only shows a "Vis mer/Vis mindre" toggle when the
 * text actually overflows the clamp (measured via scrollHeight after mount).
 */
export function DesignDescription({ text }: { text: string }) {
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
        className={
          "text-sm text-muted-foreground" +
          // clamp only on mobile; desktop (sm+) always shows full text
          (!expanded ? " line-clamp-3 sm:line-clamp-none" : "")
        }
      >
        {text}
      </p>
      {/* toggle only when the mobile clamp actually hides text (TODO:nb-review NO copy: showMore/showLess) */}
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-sm font-medium text-[var(--mk-accent)] sm:hidden"
        >
          {expanded ? t("showLess") : t("showMore")}
        </button>
      )}
    </div>
  );
}
