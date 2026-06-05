export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // TODO: middleware Supabase Auth proteggerà /admin; qui solo shell UI
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-muted/40">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 text-sm font-medium">
          Min Keramikk · Admin
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
