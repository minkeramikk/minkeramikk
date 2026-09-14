import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * R4-BUGS-C1 Ⓒ — confirming an order registers the payment. Alessio sees the
 * Vipps arrive and confirms: confirming IS constating the payment. What these
 * cover is the part a screenshot cannot — that it happens ONCE, and that a
 * cancelled order still mails nothing.
 */
const isAdmin = vi.fn();
const update = vi.fn();
const eq = vi.fn();
const getOrder = vi.fn();
const sendStatusEmail = vi.fn();
const recordOrderEvent = vi.fn();

vi.mock("@/lib/auth/admin", () => ({ getAdminUser: () => isAdmin() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => ({ update }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/orders/email", () => ({
  sendCustomMessage: vi.fn(),
  sendStatusEmail: (...args: unknown[]) => sendStatusEmail(...args),
}));
vi.mock("@/lib/orders/order-events.server", () => ({
  recordOrderEvent: (...args: unknown[]) => recordOrderEvent(...args),
}));
vi.mock("@/lib/orders/customer-pdf.server", () => ({
  fetchStoredCustomerPdf: vi.fn(),
  renderAndStoreCustomerPdf: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceRoleClient: () => ({}) }));
vi.mock("@/lib/orders/admin-orders.server", () => ({ getOrder: (id: string) => getOrder(id) }));

const ORDER_ID = "0f9c1e2a-1111-4222-8333-444455556666";

function order(over: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    code: "MK-1042",
    customerName: "Kari",
    email: "kari@example.com",
    locale: "no",
    status: "new",
    trackingCode: null,
    paidAt: null,
    discountRatifiedAt: null,
    items: [],
    ...over,
  };
}

function statusForm(status = "confirmed") {
  const fd = new FormData();
  fd.set("id", ORDER_ID);
  fd.set("status", status);
  return fd;
}

function paidForm(paid: boolean) {
  const fd = new FormData();
  fd.set("id", ORDER_ID);
  fd.set("paid", paid ? "1" : "0");
  return fd;
}

/**
 * `.eq()` is awaited on its own by most writes, and chained with
 * `.is("paid_at", null).select("id")` by the payment registration — one
 * thenable does both, and `rows` is what the conditional update matched.
 */
function chain(result: { data?: unknown; error: unknown }) {
  return {
    then: (ok: (v: unknown) => unknown) => Promise.resolve(result).then(ok),
    is: () => ({ select: () => Promise.resolve(result) }),
  };
}

/** Every `update({...})` the action sent to the orders table. */
const writes = () => update.mock.calls.map(([payload]) => payload);
const events = () => recordOrderEvent.mock.calls.map(([, kind, meta]) => [kind, meta]);

describe("confirming an order registers the payment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdmin.mockResolvedValue({ id: "admin" });
    update.mockReturnValue({ eq });
    eq.mockReturnValue(chain({ data: [{ id: ORDER_ID }], error: null }));
    sendStatusEmail.mockResolvedValue(true);
  });

  it("writes paid_at, mails once and logs the outcome", async () => {
    getOrder.mockResolvedValue(order());
    const { updateOrderStatus } = await import("./actions");

    const res = await updateOrderStatus({}, statusForm());

    expect(writes().some((w) => typeof w.paid_at === "string")).toBe(true);
    expect(sendStatusEmail).toHaveBeenCalledTimes(1);
    expect(sendStatusEmail.mock.calls[0][0]).toMatchObject({ kind: "paid", code: "MK-1042" });
    expect(events()).toContainEqual([
      "payment_registered",
      { email: "sent:kari@example.com" },
    ]);
    expect(res.notice).toContain("Payment registered");
  });

  it("leaves an already-paid order alone — no second write, no second mail", async () => {
    getOrder.mockResolvedValue(order({ paidAt: "2026-09-01T10:00:00.000Z" }));
    const { updateOrderStatus } = await import("./actions");

    const res = await updateOrderStatus({}, statusForm());

    expect(writes().some((w) => "paid_at" in w)).toBe(false);
    expect(sendStatusEmail).not.toHaveBeenCalled();
    expect(events().some(([kind]) => kind === "payment_registered")).toBe(false);
    expect(res.notice).not.toContain("Payment registered");
  });

  it("keeps the status when the mail fails, and says so in the log", async () => {
    getOrder.mockResolvedValue(order());
    sendStatusEmail.mockRejectedValue(new Error("resend down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { updateOrderStatus } = await import("./actions");

    const res = await updateOrderStatus({}, statusForm());

    expect(res.error).toBeUndefined();
    expect(writes().some((w) => w.status === "confirmed")).toBe(true);
    expect(writes().some((w) => typeof w.paid_at === "string")).toBe(true);
    expect(events()).toContainEqual(["payment_registered", { email: "failed" }]);
  });

  it("mails nothing for a cancelled order, but still registers the payment", async () => {
    getOrder.mockResolvedValue(order({ status: "cancelled" }));
    const { toggleOrderPaid } = await import("./actions");

    await toggleOrderPaid(paidForm(false));

    expect(writes().some((w) => typeof w.paid_at === "string")).toBe(true);
    expect(sendStatusEmail).not.toHaveBeenCalled();
    expect(events()).toContainEqual(["payment_registered", { email: "skipped" }]);
  });

  it("mails nothing when the conditional update matched no row", async () => {
    // Two confirms landing together: the first one wins the write, the second
    // reads an unpaid order but changes nothing — and must not mail.
    getOrder.mockResolvedValue(order());
    eq.mockReturnValue(chain({ data: [], error: null }));
    const { updateOrderStatus } = await import("./actions");

    const res = await updateOrderStatus({}, statusForm());

    expect(sendStatusEmail).not.toHaveBeenCalled();
    expect(events().some(([kind]) => kind === "payment_registered")).toBe(false);
    expect(res.notice).not.toContain("Payment registered");
  });

  it("still clears the payment by hand, mailing nothing", async () => {
    getOrder.mockResolvedValue(order({ paidAt: "2026-09-01T10:00:00.000Z" }));
    const { toggleOrderPaid } = await import("./actions");

    await toggleOrderPaid(paidForm(true));

    expect(writes()).toEqual([{ paid_at: null }]);
    expect(sendStatusEmail).not.toHaveBeenCalled();
    expect(events()).toEqual([["payment_cleared", {}]]);
  });
});
