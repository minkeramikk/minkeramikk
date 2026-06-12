import { describe, it, expect } from "vitest";
import { parseFeaturedInput } from "./featured-input";

describe("parseFeaturedInput — raw config code", () => {
  it("accepts a canonical code", () => {
    expect(parseFeaturedInput("MK-A-K2-M1")).toEqual({
      ok: true,
      kind: "design",
      payload: "MK-A-K2-M1",
    });
  });

  it("normalizes case, noise and missing prefix", () => {
    expect(parseFeaturedInput("  mk-a-k2 ")).toMatchObject({
      ok: true,
      kind: "design",
      payload: "MK-A-K2",
    });
    expect(parseFeaturedInput("A-K2-M1")).toMatchObject({
      ok: true,
      kind: "design",
      payload: "A-K2-M1",
    });
  });

  it("rejects garbage that normalizes to nothing", () => {
    for (const bad of ["", "   ", "???", "-—-", "!!!"]) {
      expect(parseFeaturedInput(bad).ok, bad).toBe(false);
    }
  });

  it("letter-noise survives the SYNTACTIC parse (the codec normalizes it) — the catalog validation at ADD is what rejects it", () => {
    // contract note: parser = shape only; "héllo wörld" → "HLLOWRLD" is a
    // plausible code shape, and decode-vs-active-designs rejects it later
    expect(parseFeaturedInput("héllo wörld")).toMatchObject({
      ok: true,
      kind: "design",
    });
  });
});

describe("parseFeaturedInput — raw set param (CA-3)", () => {
  it("accepts and canonicalizes a valid set", () => {
    const r = parseFeaturedInput("mk-a-k2.flat-plate.2~MK-C.mug.1");
    expect(r).toMatchObject({
      ok: true,
      kind: "set",
      payload: "MK-A-K2.flat-plate.2~MK-C.mug.1",
    });
    if (r.ok && r.kind === "set") {
      expect(r.entries).toHaveLength(2);
      expect(r.entries[1]).toEqual({
        configCode: "MK-C",
        productSlug: "mug",
        qty: 1,
      });
    }
  });

  it("clamps qty through the CA-3 codec", () => {
    const r = parseFeaturedInput("MK-A.mug.999");
    expect(r).toMatchObject({ ok: true, payload: "MK-A.mug.99" });
  });

  it("is STRICT at add: one malformed row rejects the whole input", () => {
    const r = parseFeaturedInput("MK-A.mug.2~broken-row.x");
    expect(r).toEqual({ ok: false, reason: "invalid-set" });
  });

  it("rejects an all-garbage set shape", () => {
    expect(parseFeaturedInput("..~..")).toEqual({
      ok: false,
      reason: "invalid-set",
    });
  });
});

describe("parseFeaturedInput — app URLs (the primary UX)", () => {
  it("extracts ?code= from a ConfigCodeBar copy-link", () => {
    const r = parseFeaturedInput(
      "https://minkeramikk.no/no/configurator?design=blomster-1&code=MK-A-K2&step=2"
    );
    expect(r).toMatchObject({ ok: true, kind: "design", payload: "MK-A-K2" });
  });

  it("extracts ?set= from a Share-your-set link", () => {
    const r = parseFeaturedInput(
      "http://localhost:3000/en/configurator?step=3&set=MK-A-K2.flat-plate.2~MK-C.mug.1"
    );
    expect(r).toMatchObject({
      ok: true,
      kind: "set",
      payload: "MK-A-K2.flat-plate.2~MK-C.mug.1",
    });
  });

  it("handles URL-encoded payloads and protocol-less / relative links", () => {
    expect(
      parseFeaturedInput("minkeramikk.no/no/configurator?code=MK%2DA%2DK2")
    ).toMatchObject({ ok: true, kind: "design", payload: "MK-A-K2" });
    expect(
      parseFeaturedInput("/no/configurator?step=3&set=MK-A.mug.1")
    ).toMatchObject({ ok: true, kind: "set", payload: "MK-A.mug.1" });
  });

  it("set wins when an URL carries both ?code= and ?set=", () => {
    const r = parseFeaturedInput(
      "https://x.no/configurator?code=MK-A&set=MK-C.mug.1"
    );
    expect(r).toMatchObject({ ok: true, kind: "set" });
  });

  it("an app URL without payload is a parlante error, not 'invalid code'", () => {
    expect(
      parseFeaturedInput("https://minkeramikk.no/no/configurator?step=2")
    ).toEqual({ ok: false, reason: "url-without-payload" });
  });

  it("a strict-invalid set inside an URL still rejects", () => {
    expect(
      parseFeaturedInput("https://x.no/c?set=MK-A.mug.2~garbage")
    ).toEqual({ ok: false, reason: "invalid-set" });
  });
});

describe("parseFeaturedInput — canonical payload = dedup-friendly", () => {
  it("equivalent inputs produce the SAME payload (DB UNIQUE works)", () => {
    const a = parseFeaturedInput("mk-a-k2");
    const b = parseFeaturedInput("https://x.no/c?code=MK%2DA%2DK2");
    const c = parseFeaturedInput("  MK-A-K2  ");
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (a.ok && b.ok && c.ok) {
      expect(new Set([a.payload, b.payload, c.payload]).size).toBe(1);
    }
  });
});
