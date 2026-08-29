import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { CartProvider } from "@/lib/cart/cart-context";
import { getDiscountConfig } from "@/lib/discounts/config.server";

/**
 * Public layout shell (DESIGN-SYSTEM §4): ink header, constrained main,
 * minimal footer. Every public page renders inside this.
 *
 * F16: wrapped in CartProvider so the header CartButton/CartDrawer and step 3
 * share one cart instance (single source of truth within a tab).
 * R4-SCONTI: the discount config is read HERE, once per render, and handed down
 * as a prop — no client component ever fetches it (AGENTS: data comes from the
 * server, never a client-side catalog fetch).
 */
export async function PublicShell({ children }: { children: React.ReactNode }) {
  const discountConfig = await getDiscountConfig();
  return (
    <CartProvider config={discountConfig}>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1060px] flex-1 px-5 py-7">
        {children}
      </main>
      <SiteFooter />
    </CartProvider>
  );
}
