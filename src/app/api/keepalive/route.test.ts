import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * R4-504-COLD Ⓑ — the warm-up ping runs every ten minutes. The one thing that
 * must be true of it is that it does NOT reach the service-role client: that
 * path emails an alert above 80%, and at this frequency it would email one
 * every ten minutes. The auth gate is checked here too, because the warm mode
 * must not become a public route by accident.
 */
const anonSelect = vi.fn();
const createServiceRoleClient = vi.fn();
const send = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => ({ select: anonSelect }) }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: () => createServiceRoleClient(),
}));
vi.mock("@/lib/orders/email", () => ({ defaultTransport: () => ({ send }) }));

const { GET } = await import("./route");

const SECRET = "cron-secret-for-the-test";
const call = (query = "") =>
  GET(
    new Request(`https://minkeramikk.no/api/keepalive${query}`, {
      headers: { authorization: `Bearer ${SECRET}` },
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
  anonSelect.mockResolvedValue({ error: null });
  createServiceRoleClient.mockReturnValue({ rpc: async () => ({ data: 0 }) });
});

describe("GET /api/keepalive?mode=warm", () => {
  it("does one anon read and never touches the service-role client", async () => {
    const res = await call("?mode=warm");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(anonSelect).toHaveBeenCalledTimes(1);
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("still runs the usage check with no parameter, for the daily cron", async () => {
    const res = await call();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, usage: expect.anything() });
    expect(createServiceRoleClient).toHaveBeenCalledTimes(1);
  });

  it("is 401 without the secret in warm mode too", async () => {
    const res = await GET(new Request("https://minkeramikk.no/api/keepalive?mode=warm"));

    expect(res.status).toBe(401);
    expect(anonSelect).not.toHaveBeenCalled();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });
});
