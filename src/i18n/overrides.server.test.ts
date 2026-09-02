/**
 * R4-I18N / AC3 — the fallback is the most important constraint of the card:
 * the public site cannot break for an admin editor.
 *
 * Four ways to have no overrides, all real:
 *  - the table does not exist yet (the PM applies migration 0039: there is a
 *    window where this code is live and the migration is not) → PostgREST
 *    42P01, or PostgREST's own PGRST205 (Task 1 saw both empirically);
 *  - the database does not respond;
 *  - `unstable_cache` is called outside a request scope and THROWS (lesson
 *    R4-MAIL-JOURNEY §E, cf. theme.server.test.ts);
 *  - there is simply no override row.
 * In all four the site serves the files, identical to today.
 *
 * Mocking `next/cache`: `unstable_cache` throws in vitest whenever there is no
 * incremental cache (`node_modules/next/dist/server/web/spec-extension/
 * unstable-cache.js` ~L58-67) — which is always, in this process. Leaving the
 * real module in place would make it throw on EVERY case, so the three cases
 * that assert real override behaviour would fail outright, and the two AC3
 * fallback cases would pass because the cache threw, not because the loader's
 * own error handling ran — a vacuous suite. So `next/cache` is mocked as a
 * PASS-THROUGH by default (`(fn) => fn`, what production does when the cache
 * is available), and exactly one case re-mocks it as throwing, to pin the
 * outside-request-scope fallback specifically. Do not "simplify" this back to
 * the real module — see above for why that is vacuous.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const eq = vi.fn();

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({ from: () => ({ select: () => ({ eq }) }) }),
}));

describe("message overrides", () => {
  beforeEach(() => {
    vi.resetModules();
    eq.mockReset();
    vi.doMock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
  });

  it("maps the rows it gets", async () => {
    eq.mockResolvedValue({
      data: [{ key: "cart.button", value: "Kurv" }],
      error: null,
    });
    const { getMessageOverridesSafe } = await import("./overrides.server");
    await expect(getMessageOverridesSafe("no")).resolves.toEqual({
      "cart.button": "Kurv",
    });
  });

  it("drops a row outside the editable perimeter (AC4, defence in depth)", async () => {
    eq.mockResolvedValue({
      data: [
        { key: "_review", value: "hacked" },
        { key: "cart.button", value: "Kurv" },
      ],
      error: null,
    });
    const { getMessageOverridesSafe } = await import("./overrides.server");
    await expect(getMessageOverridesSafe("no")).resolves.toEqual({
      "cart.button": "Kurv",
    });
  });

  it.each([["42P01"], ["PGRST205"]])(
    "falls back to the files when the table does not exist yet (%s)",
    async (code) => {
      eq.mockResolvedValue({ data: null, error: { code } });
      const { getMessages } = await import("./overrides.server");
      const no = (await import("./messages/no.json")).default;
      await expect(getMessages("no")).resolves.toEqual(no);
    }
  );

  it("falls back to the files when the database is unreachable", async () => {
    eq.mockRejectedValue(new Error("ECONNREFUSED"));
    const { getMessages } = await import("./overrides.server");
    const no = (await import("./messages/no.json")).default;
    await expect(getMessages("no")).resolves.toEqual(no);
  });

  it.each([
    [null, "null"],
    [42, "number"],
  ])(
    "falls back to the files when a row's key is malformed (%s)",
    async (badKey) => {
      eq.mockResolvedValue({
        data: [{ key: badKey, value: "hacked" }],
        error: null,
      });
      const { getMessages } = await import("./overrides.server");
      const no = (await import("./messages/no.json")).default;
      await expect(getMessages("no")).resolves.toEqual(no);
    }
  );

  it("never lets a null override value overwrite the file's text (AC3, sibling of the malformed-key path)", async () => {
    eq.mockResolvedValue({
      data: [{ key: "cart.button", value: null }],
      error: null,
    });
    const { getMessages } = await import("./overrides.server");
    const no = (await import("./messages/no.json")).default as {
      cart: { button: string };
    };
    const messages = (await getMessages("no")) as {
      cart: { button: string };
    };
    expect(messages.cart.button).toBe(no.cart.button);
    expect(messages.cart.button).not.toBeNull();
  });

  it("falls back to the files outside a request scope, where unstable_cache throws", async () => {
    vi.doMock("next/cache", () => ({
      unstable_cache: () => () => {
        throw new Error("`unstable_cache` cannot be called outside a request scope");
      },
    }));
    vi.resetModules();
    const { getMessages } = await import("./overrides.server");
    const en = (await import("./messages/en.json")).default;
    await expect(getMessages("en")).resolves.toEqual(en);
  });

  it("applies an override on top of the file when there is one", async () => {
    eq.mockResolvedValue({
      data: [{ key: "configurator.step1.hero.title", value: "Ny tittel" }],
      error: null,
    });
    const { getMessages } = await import("./overrides.server");
    const messages = (await getMessages("no")) as {
      configurator: { step1: { hero: { title: string } } };
    };
    expect(messages.configurator.step1.hero.title).toBe("Ny tittel");
  });
});
