import { NextResponse } from "next/server";
import { createOrder } from "@/lib/orders/create";

// POST /api/orders — submit an order (F05). Validation + Turnstile + atomic
// create + emails live in createOrder(); this is just the HTTP boundary.
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
  return NextResponse.json({ code: result.code }, { status: 201 });
}
