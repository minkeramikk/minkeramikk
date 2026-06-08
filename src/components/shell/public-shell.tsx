import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { CartProvider } from "@/lib/cart/cart-context";

/**
 * Public layout shell (DESIGN-SYSTEM §4): ink header, constrained main,
 * minimal footer. Every public page renders inside this.
 *
 * F16: wrapped in CartProvider so the header CartButton/CartDrawer and step 3
 * share one cart instance (single source of truth within a tab).
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1060px] flex-1 px-5 py-7">
        {children}
      </main>
      <SiteFooter />
    </CartProvider>
  );
}
