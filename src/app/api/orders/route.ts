import { NextResponse } from "next/server";

// POST /api/orders — invio ordine dal configuratore
// TODO: validazione (zod) + Turnstile + insert Supabase + email Resend
export async function POST() {
  return NextResponse.json(
    { error: "Not implemented" },
    { status: 501 },
  );
}
