/** Back-office navigation (F06). Shared by the desktop sidebar and the mobile
 *  drawer so they never drift. English-only (i18n rule 5). */
export const ADMIN_NAV = [
  { href: "/admin", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/suppliers", label: "Suppliers" },
  { href: "/admin/designs", label: "Configurator assets" },
  { href: "/admin/theme", label: "Theme" },
] as const;

export type AdminNavHref = (typeof ADMIN_NAV)[number]["href"];
