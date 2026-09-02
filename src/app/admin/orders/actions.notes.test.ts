import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * R4-FIX Ⓒ — «Save note» must SAY what happened. The action used to return
 * void: it swallowed the admin check and the update error alike, so the UI had
 * nothing to render and a rejected write looked exactly like a saved one.
 */
const isAdmin = vi.fn();
const update = vi.fn();
const eq = vi.fn();

vi.mock("@/lib/auth/admin", () => ({ getAdminUser: () => isAdmin() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => ({ update }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/orders/email", () => ({ sendCustomMessage: vi.fn(), sendStatusEmail: vi.fn() }));
vi.mock("@/lib/orders/order-events.server", () => ({ recordOrderEvent: vi.fn() }));
vi.mock("@/lib/orders/customer-pdf.server", () => ({
  fetchStoredCustomerPdf: vi.fn(),
  renderAndStoreCustomerPdf: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceRoleClient: () => ({}) }));
vi.mock("@/lib/orders/admin-orders.server", () => ({ getOrder: vi.fn() }));

const ORDER_ID = "0f9c1e2a-1111-4222-8333-444455556666";

function form(notes = "call back Thursday") {
  const fd = new FormData();
  fd.set("id", ORDER_ID);
  fd.set("notes", notes);
  return fd;
}

describe("updateOrderNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdmin.mockResolvedValue({ id: "admin" });
    update.mockReturnValue({ eq });
    eq.mockResolvedValue({ error: null });
  });

  it("saves and says so", async () => {
    const { updateOrderNotes } = await import("./actions");
    const res = await updateOrderNotes({}, form());

    expect(res).toEqual({ notice: "Note saved." });
    expect(update).toHaveBeenCalledWith({ internal_notes: "call back Thursday" });
    expect(eq).toHaveBeenCalledWith("id", ORDER_ID);
  });

  it("reports a rejected update instead of claiming success", async () => {
    eq.mockResolvedValue({ error: { message: "row level security" } });
    const { updateOrderNotes } = await import("./actions");

    expect(await updateOrderNotes({}, form())).toEqual({
      error: "The note could not be saved.",
    });
  });

  it("writes nothing for a non-admin", async () => {
    isAdmin.mockResolvedValue(null);
    const { updateOrderNotes } = await import("./actions");

    expect(await updateOrderNotes({}, form())).toEqual({ error: "Not authorized." });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a malformed submission without writing", async () => {
    const fd = new FormData();
    fd.set("id", "not-a-uuid");
    fd.set("notes", "x");
    const { updateOrderNotes } = await import("./actions");

    expect(await updateOrderNotes({}, fd)).toEqual({ error: "The note could not be saved." });
    expect(update).not.toHaveBeenCalled();
  });
});
