"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Admin error boundary (CQ-2). English-only (admin convention, i18n rule 5),
 * simpler than the public one. No stack/detail in the UI — logged to console.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin error boundary]", error);
  }, [error]);

  return (
    <main
      data-testid="admin-error"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 py-16 text-center"
    >
      <div className="max-w-md">
        <h1 className="text-xl font-semibold text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred. Try again, or return to the dashboard.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          data-testid="admin-error-retry"
          className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
        <Link
          href="/admin"
          className="h-9 rounded-lg border border-border px-4 text-sm leading-9 text-foreground hover:bg-muted"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
