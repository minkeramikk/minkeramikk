import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

/**
 * Public layout shell (DESIGN-SYSTEM §4): ink header, constrained main,
 * minimal footer. Every public page renders inside this.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1060px] flex-1 px-5 py-7">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
