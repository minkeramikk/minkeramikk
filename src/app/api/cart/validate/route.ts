import { NextResponse } from "next/server";
import { resolveCartEntries } from "@/lib/cart/resolve-cart-entries";
import { validateRequestSchema } from "./schema";

/**
 * POST /api/cart/validate — F40: dice se le righe di un carrello SALVATO
 * esistono ancora e come si ricostruiscono oggi (prezzi, nomi, layers vivi).
 * Non salva niente: la persistenza del carrello salvato resta solo nel browser.
 * Il corpo porta SOLO codice+slug+quantità — nota colore e scritta personalizzata
 * non lasciano mai il client (le riattacca lui, secondo i flag di risposta).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = validateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const results = await resolveCartEntries(
    parsed.data.entries.map((e) => ({
      configCode: e.configCode,
      productSlug: e.productSlug,
      qty: e.quantity,
    }))
  );

  // `selections` serve solo alla landing `?set=`: non esce di qui.
  return NextResponse.json({
    results: results.map((r) =>
      r.ok
        ? {
            ok: true as const,
            line: r.line,
            acceptsCustomNotes: r.acceptsCustomNotes,
            acceptsCustomText: r.acceptsCustomText,
          }
        : r
    ),
  });
}
