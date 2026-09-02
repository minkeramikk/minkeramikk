import { NextResponse, type NextRequest } from "next/server";
import { getAdminUser } from "@/lib/auth/admin";
import { getOrder } from "@/lib/orders/admin-orders.server";
import { fetchStoredCustomerPdf } from "@/lib/orders/customer-pdf.server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/orders/[id]/summary — download the stored customer summary.
 *
 * R4-PDF-CLIENTE riuso ④. It SERVES the archived object; it never renders one —
 * generation has exactly one home, in the deferred work of order creation.
 *
 * 🔒 INVARIANTE: this is an ADMIN surface. `/api` is outside the auth
 * middleware, so — like the lab-PDF route next to it — it self-guards with
 * getAdminUser() and answers 401 to anyone else. No public route, page or
 * parameter resolves a summary: giving the file to the customer would mean
 * reopening that decision (card, NOTA 2/9 sui riusi), not adding an endpoint.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getAdminUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const order = await getOrder(id);
  if (!order) return new NextResponse("Not found", { status: 404 });

  const pdf = await fetchStoredCustomerPdf(createServiceRoleClient(), id);
  if (!pdf) return new NextResponse("No stored summary for this order", { status: 404 });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="bestilling-${order.code}.pdf"`,
    },
  });
}
