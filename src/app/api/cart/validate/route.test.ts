import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

// Mock the resolver so no DB is touched.
vi.mock("@/lib/cart/resolve-cart-entries", () => ({
  resolveCartEntries: vi.fn(),
}));

import { resolveCartEntries } from "@/lib/cart/resolve-cart-entries";

describe("POST /api/cart/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("strips `selections` from ok entries and preserves failed entries in place (F40 boundary)", async () => {
    // The resolver returns internal fields like `selections` (for the ?set= landing);
    // the route must not leak them. Here: one ok entry with selections + extra data,
    // one failed entry. The response must have same length, same order, and the ok
    // entry must have NO `selections` key.
    const mockResults = [
      {
        ok: true as const,
        line: {
          id: "p1::MK-A-B",
          productId: "p1",
          productNameNo: "Vietri sett",
          productNameEn: "Vietri set",
          supplierId: "s1",
          supplierName: "Vietri",
          unitPriceCents: 95000,
          currency: "NOK",
          quantity: 1,
          configCode: "MK-A-B",
          configSnapshot: { designSlug: "amalfi" },
          layers: [{ src: "/a.png", recolor: true }],
          plateImage: "/plate.png",
          productSlug: "vietri-set",
          pieces: 2,
        },
        selections: [{ label: "Farge", option: "Blå" }], // resolver-only field, must not leave
        acceptsCustomNotes: true,
        acceptsCustomText: false,
      },
      {
        ok: false as const,
        reason: "product" as const,
      },
    ];
    vi.mocked(resolveCartEntries).mockResolvedValue(mockResults);

    const request = new Request("http://localhost/api/cart/validate", {
      method: "POST",
      body: JSON.stringify({
        entries: [
          { configCode: "MK-A-B", productSlug: "vietri-set", quantity: 1 },
          { configCode: "MK-C-D", productSlug: "vietri-set", quantity: 2 },
        ],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();

    // Same length and order as request: first ok, second failed.
    expect(body.results).toHaveLength(2);
    expect(body.results[0].ok).toBe(true);
    expect(body.results[1].ok).toBe(false);
    expect(body.results[1].reason).toBe("product");

    // The ok entry must NOT have `selections` key (assert on keys, not just undefined).
    const okEntry = body.results[0];
    expect(Object.keys(okEntry)).toEqual(
      expect.arrayContaining(["ok", "line", "acceptsCustomNotes", "acceptsCustomText"])
    );
    expect(Object.keys(okEntry)).not.toContain("selections");
    expect(okEntry.line).toBeDefined();
    expect(okEntry.acceptsCustomNotes).toBe(true);
    expect(okEntry.acceptsCustomText).toBe(false);
  });

  it("rejects malformed JSON body with 400 (trust boundary)", async () => {
    const request = new Request("http://localhost/api/cart/validate", {
      method: "POST",
      body: "{not valid json",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid json");
  });

  it("rejects schema validation failure (e.g. extra field) with 400 (.strict() protection)", async () => {
    // Schema uses .strict(), so extra fields like `customNote` must fail.
    // This field must NEVER reach the server, even if a client tries to send it.
    const request = new Request("http://localhost/api/cart/validate", {
      method: "POST",
      body: JSON.stringify({
        entries: [
          {
            configCode: "MK-A-B",
            productSlug: "vietri-set",
            quantity: 1,
            customNote: "this should not be allowed",
          },
        ],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid payload");
    // Resolver must not be called when schema fails.
    expect(resolveCartEntries).not.toHaveBeenCalled();
  });

  it("rejects schema validation failure (quantity out of range) with 400", async () => {
    const request = new Request("http://localhost/api/cart/validate", {
      method: "POST",
      body: JSON.stringify({
        entries: [{ configCode: "MK-A-B", productSlug: "vietri-set", quantity: 0 }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid payload");
    expect(resolveCartEntries).not.toHaveBeenCalled();
  });
});
