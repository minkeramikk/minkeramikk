import { NextResponse, type NextRequest } from "next/server";
import { getAdminUser } from "@/lib/auth/admin";
import { getOrder } from "@/lib/orders/admin-orders.server";
import { renderSupplierPdf } from "@/lib/orders/lab-pdf.server";

// sharp + @react-pdf need the Node runtime; never cache (live order data).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/orders/[id]/pdf?supplier=<uuid>
 * Per-supplier production-order PDF download. /api is outside the auth
 * middleware, so this route self-guards with getAdminUser() → 401 for anon.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getAdminUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const supplierId = req.nextUrl.searchParams.get("supplier");
  if (!supplierId) return new NextResponse("Missing supplier", { status: 400 });

  const order = await getOrder(id);
  if (!order) return new NextResponse("Not found", { status: 404 });

  const pdf = await renderSupplierPdf(order, supplierId);
  if (!pdf) return new NextResponse("No items for this supplier", { status: 404 });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="production-order-${order.code}.pdf"`,
    },
  });
}
