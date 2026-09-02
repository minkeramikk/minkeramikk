import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * R4-PDF-CLIENTE riuso ④ — il recupero SCARICA, non rigenera.
 *
 * La generazione ha un punto solo (alla creazione dell'ordine, dentro
 * `after()`). Questo test è la difesa automatica contro il secondo: mocka il
 * modulo del renderer e verifica che il percorso admin non lo sfiori nemmeno.
 */
const fetchStored = vi.fn();
const renderAndStore = vi.fn();
const sendCustomMessage = vi.fn();
const recordOrderEvent = vi.fn();

vi.mock("@/lib/orders/customer-pdf.server", () => ({
  fetchStoredCustomerPdf: fetchStored,
  renderAndStoreCustomerPdf: renderAndStore,
}));
vi.mock("@/lib/orders/email", () => ({ sendCustomMessage, sendStatusEmail: vi.fn() }));
vi.mock("@/lib/orders/order-events.server", () => ({ recordOrderEvent }));
vi.mock("@/lib/auth/admin", () => ({ getAdminUser: async () => ({ id: "admin" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceRoleClient: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/orders/admin-orders.server", () => ({
  getOrder: async () => ({
    id: ORDER_ID,
    code: "MK-1042",
    email: "kari@example.no",
    customerName: "Kari",
    locale: "no",
    items: [],
  }),
}));

const ORDER_ID = "0f9c1e2a-1111-4222-8333-444455556666";

const form = (attach: boolean) => {
  const fd = new FormData();
  fd.set("id", ORDER_ID);
  fd.set("subject", "Om bestillingen MK-1042");
  fd.set("body", "Hei Kari");
  if (attach) fd.set("attachSummary", "on");
  return fd;
};

describe("sendCustomerMessage — l'allegato viene dall'archivio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendCustomMessage.mockResolvedValue(undefined);
  });

  it("con la casella spuntata SCARICA e allega — e NON rigenera mai", async () => {
    fetchStored.mockResolvedValue(Buffer.from("%PDF-1.4"));
    const { sendCustomerMessage } = await import("./actions");
    const res = await sendCustomerMessage({}, form(true));

    expect(res.error).toBeUndefined();
    expect(fetchStored).toHaveBeenCalledOnce();
    expect(renderAndStore).not.toHaveBeenCalled(); // la difesa
    expect(sendCustomMessage.mock.calls[0][0].pdf).toBeInstanceOf(Buffer);
    expect(recordOrderEvent).toHaveBeenCalledWith(
      ORDER_ID,
      "custom_email_sent",
      expect.objectContaining({ summary: "attached" })
    );
  });

  it("senza nulla da allegare la mail parte lo stesso, e il log dice come è andata", async () => {
    fetchStored.mockResolvedValue(null); // ordine anteriore alla feature
    const { sendCustomerMessage } = await import("./actions");
    const res = await sendCustomerMessage({}, form(true));

    expect(res.error).toBeUndefined();
    expect(sendCustomMessage.mock.calls[0][0].pdf).toBeNull();
    expect(recordOrderEvent).toHaveBeenCalledWith(
      ORDER_ID,
      "custom_email_sent",
      expect.objectContaining({ summary: "unavailable" })
    );
  });

  it("senza la casella non si tocca lo Storage, e il log resta com'era", async () => {
    const { sendCustomerMessage } = await import("./actions");
    await sendCustomerMessage({}, form(false));

    expect(fetchStored).not.toHaveBeenCalled();
    expect(recordOrderEvent).toHaveBeenCalledWith(ORDER_ID, "custom_email_sent", {
      subject: "Om bestillingen MK-1042",
      to: "kari@example.no",
    });
  });
});
