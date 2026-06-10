"use client";

import { useEffect } from "react";

/**
 * Last-resort fallback if the ROOT layout itself throws (CQ-2). It replaces the
 * whole document, so there is no locale/provider/Tailwind context here — the
 * markup is fully self-contained with inline styles in the brand defaults, and
 * the copy is short and bilingual. No technical detail reaches the customer.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="no">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fbe9e4",
          color: "#2b2330",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div data-testid="global-error" style={{ maxWidth: 420 }}>
          <p style={{ fontWeight: 600, fontSize: "1.05rem", margin: 0 }}>
            minkeramikk.no
          </p>
          <h1 style={{ fontSize: "1.5rem", margin: "0.75rem 0 0" }}>
            Noe gikk galt · Something went wrong
          </h1>
          <p
            style={{
              color: "rgba(43,35,48,0.7)",
              fontSize: "0.9rem",
              marginTop: "0.5rem",
            }}
          >
            Prøv igjen om litt. · Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "1.5rem",
              background: "#7d4f9c",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "0.6rem 1.25rem",
              fontSize: "0.9rem",
              cursor: "pointer",
            }}
          >
            Prøv igjen / Try again
          </button>
        </div>
      </body>
    </html>
  );
}
