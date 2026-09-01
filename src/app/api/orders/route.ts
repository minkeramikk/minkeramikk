import { NextResponse, after } from "next/server";
import { createOrder } from "@/lib/orders/create";

// POST /api/orders — submit an order (F05). Validation + Turnstile + atomic
// create live in createOrder(); this is just the HTTP boundary.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const result = await createOrder(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  // R4-MAIL-JOURNEY §E: the three emails run AFTER the response, so the
  // customer stops watching a spinner before the thank-you page. This is the
  // one place that is certainly request-scoped, which is why `after()` lives
  // here and not inside createOrder(). The order is already persisted; only the
  // post moved. NOT an endpoint the browser can call — that would be an open
  // relay.
  after(result.sendEmails);
  // R4-TAKK: `total` (minor units) rides along so the confirmation page shows
  // the server's figure, not one recomputed from the URL.
  return NextResponse.json(
    { code: result.code, total: result.totalCents },
    { status: 201 }
  );
}
