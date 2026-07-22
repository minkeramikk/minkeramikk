/**
 * F40 — payload di `POST /api/cart/validate`. Trust boundary: il corpo arriva
 * dal localStorage del browser, che è input utente a tutti gli effetti.
 * Le forme sono le stesse già usate dal codec del link condiviso (set-code.ts),
 * così un codice che passa di qui è lo stesso che passerebbe da `?set=`.
 *
 * `.strict()` non è cosmetico: garantisce che nota colore e scritta
 * personalizzata NON possano finire nel corpo per una svista futura — i campi
 * personali restano nel browser (regola "non viaggiano nei link", F38/R2-2b).
 */
import { z } from "zod";
import { SET_MAX_LINES, SET_QTY_MAX, SET_QTY_MIN } from "@/lib/cart/set-code";

export const validateRequestSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            configCode: z.string().regex(/^[A-Z0-9-]+$/).max(120),
            productSlug: z.string().regex(/^[a-z0-9-]+$/).max(120),
            quantity: z.number().int().min(SET_QTY_MIN).max(SET_QTY_MAX),
          })
          .strict()
      )
      .min(1)
      .max(SET_MAX_LINES),
  })
  .strict();

export type ValidateRequest = z.infer<typeof validateRequestSchema>;
