/**
 * R4-PDF-CLIENTE, trappola 1 di MAIL-JOURNEY §E — la stessa di
 * `theme.server.test.ts`, su un'altra funzione.
 *
 * Il riepilogo PDF si genera dentro `after()`, dove `unstable_cache` LANCIA, e
 * la risoluzione dei layer del design passa da `getDesignDetail`, che è un
 * `unstable_cache(...)()` nudo. Senza ripiego non esce un PDF senza immagine:
 * esce un'eccezione dentro `after()`, che non risale a nessuno.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();
const order = vi.fn();

vi.mock("next/cache", () => ({
  // esattamente ciò che fa Next fuori da una richiesta
  unstable_cache: () => () => {
    throw new Error("`unstable_cache` cannot be called outside a request scope");
  },
}));

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle, order }),
      }),
    }),
  }),
}));

const DESIGN = {
  id: "d1",
  slug: "krabbe",
  code: "KRB",
  name: "Krabbe",
  name_no: "Krabbe",
  name_en: "Crab",
  accepts_custom_notes: true,
  accepts_custom_text: false,
  description_step2_no: null,
  description_step2_en: null,
};

describe("getDesignDetailSafe fuori dal contesto di richiesta", () => {
  beforeEach(() => {
    vi.resetModules();
    maybeSingle.mockReset();
    order.mockReset();
    order.mockResolvedValue({ data: [] });
  });

  it("ripiega su una lettura NON cacheata e restituisce il design vero", async () => {
    maybeSingle.mockResolvedValue({ data: DESIGN });
    const { getDesignDetailSafe } = await import("./design-options");
    const detail = await getDesignDetailSafe("krabbe");
    expect(detail?.slug).toBe("krabbe");
    expect(detail?.nameEn).toBe("Crab");
  });

  it("uno slug inesistente resta null, non un'eccezione", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    const { getDesignDetailSafe } = await import("./design-options");
    await expect(getDesignDetailSafe("nope")).resolves.toBeNull();
  });

  it("se anche la lettura non cacheata fallisce, l'errore risale al chiamante", async () => {
    // Il chiamante (customer-pdf.server) degrada a «nessuna immagine»: è LUI a
    // decidere, non questa funzione, che non deve inventarsi un design vuoto.
    maybeSingle.mockRejectedValue(new Error("ECONNREFUSED"));
    const { getDesignDetailSafe } = await import("./design-options");
    await expect(getDesignDetailSafe("krabbe")).rejects.toThrow("ECONNREFUSED");
  });
});
