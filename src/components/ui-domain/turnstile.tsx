"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget (F05). Explicit render; emits the token via
 * onToken. In dev/CI without a configured site key it uses Cloudflare's
 * documented test key (always passes), so the order flow is exercisable
 * end-to-end without a real key.
 */
const TEST_SITE_KEY_ALWAYS_PASSES = "1x00000000000000000000AA";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          theme?: "auto" | "light" | "dark";
          size?: "normal" | "flexible" | "compact";
        }
      ) => string;
      remove: (id: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    const configured = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const sitekey = configured || TEST_SITE_KEY_ALWAYS_PASSES;

    // dev/CI without a real key: the server verifies with the always-pass test
    // secret (any token succeeds), so emit a placeholder token immediately and
    // skip the real challenge (which can't complete headless). Prod uses the
    // real widget + real secret.
    if (!configured) {
      onToken("test-token");
      return;
    }

    function render() {
      if (!ref.current || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey,
        // flexible = widget spans the form box width; light = white-ish to sit
        // on our cream card (the iframe internals can't be brand-coloured).
        theme: "light",
        size: "flexible",
        callback: (token) => onToken(token),
        "error-callback": () => onToken(""),
      });
    }

    if (window.turnstile) {
      render();
    } else if (!document.getElementById("cf-turnstile-script")) {
      const s = document.createElement("script");
      s.id = "cf-turnstile-script";
      s.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      s.onload = render;
      document.head.appendChild(s);
    } else {
      const t = setInterval(() => {
        if (window.turnstile) {
          clearInterval(t);
          render();
        }
      }, 100);
      return () => clearInterval(t);
    }
  }, [onToken]);

  return <div ref={ref} data-testid="turnstile" className="min-h-[65px] w-full" />;
}
