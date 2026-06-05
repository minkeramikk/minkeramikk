export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Pages compose AdminShell themselves (it needs the per-page title).
  // Supabase Auth middleware will guard /admin with flow F06.
  return children;
}
