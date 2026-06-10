import Link from "next/link";

/** Branded admin 404 (CQ-2). English-only (admin convention). */
export default function AdminNotFound() {
  return (
    <main
      data-testid="admin-not-found"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 py-16 text-center"
    >
      <div className="max-w-md">
        <p
          aria-hidden
          className="text-5xl font-semibold text-muted-foreground/30"
        >
          404
        </p>
        <h1 className="mt-1 text-xl font-semibold text-foreground">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This admin page doesn&apos;t exist.
        </p>
      </div>
      <Link
        href="/admin"
        className="h-9 rounded-lg bg-primary px-4 text-sm font-medium leading-9 text-primary-foreground"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
