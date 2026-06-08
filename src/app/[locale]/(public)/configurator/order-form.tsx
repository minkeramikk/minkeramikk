// Moved in F16 → the order form is now reached from the CartDrawer, not inline
// in step 3. Canonical implementation lives in components/ui-domain. This
// re-export keeps any older import paths working.
export { OrderForm } from "@/components/ui-domain/order-form";
