import { AdminShell } from "@/components/shell/admin-shell";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, money, type Currency } from "@/lib/money/money";
import { assetUrl } from "@/lib/storage";
import { CloneCeramicsPanel } from "@/components/admin/clone-ceramics-panel";

export const dynamic = "force-dynamic";

export default async function CloneCeramicsPage() {
  const supabase = await createClient();

  const [{ data: suppliers }, { data: products }] = await Promise.all([
    supabase.from("suppliers").select("id, name").order("name"),
    supabase
      .from("products")
      .select("id, supplier_id, name_no, name_en, price_cents, currency, image")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  const candidates = (products ?? []).map((p) => ({
    id: p.id,
    supplierId: p.supplier_id,
    nameNo: p.name_no,
    nameEn: p.name_en,
    price: formatMoney(money(p.price_cents, p.currency as Currency), "en"),
    image: p.image ? assetUrl(p.image, { width: 256 }) : null,
  }));

  return (
    <AdminShell active="/admin/products" title="Clone ceramics">
      <CloneCeramicsPanel
        suppliers={suppliers ?? []}
        products={candidates}
      />
    </AdminShell>
  );
}
