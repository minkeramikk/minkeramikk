import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { CartProvider } from "@/lib/cart/cart-context";
import { SwapCartDialog } from "@/components/ui-domain/swap-cart-dialog";

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
      {/* F40: UNA sola istanza del dialogo di scambio — i due punti di
          "Lagre til senere" (drawer e step 3) e "Hent tilbake" condividono
          lo stesso stato, quindi lo stesso dialogo. Montato QUI e non dentro
          CartProvider: il dialogo legge useCartContext(), e tenerlo nel
          provider creava un import circolare (funzionava solo perché
          entrambi gli export sono `function` dichiarate — un refactor a
          `const` lo avrebbe rotto in silenzio). */}
      <SwapCartDialog />
    </CartProvider>
  );
}
