import { describe, it, expect } from "vitest";
import { kitTitle, type KitContext } from "./kit-context";

const FALLBACK = "A kit from minkeramikk";

describe("kitTitle", () => {
  it("prefers the active locale", () => {
    const ctx: KitContext = {
      label: { no: "Et kit fra Daniele", en: "A kit from Daniele" },
      image: null,
      custom: false,
    };
    expect(kitTitle(ctx, "no", FALLBACK)).toBe("Et kit fra Daniele");
    expect(kitTitle(ctx, "en", FALLBACK)).toBe("A kit from Daniele");
  });

  it("falls back to the other language when the active one is missing", () => {
    const ctx: KitContext = {
      label: { no: null, en: "A kit from Daniele" },
      image: null,
      custom: false,
    };
    expect(kitTitle(ctx, "no", FALLBACK)).toBe("A kit from Daniele");
  });

  it("falls back to the generic title with no label", () => {
    const bare: KitContext = { label: null, image: null, custom: false };
    expect(kitTitle(bare, "no", FALLBACK)).toBe(FALLBACK);
    expect(kitTitle(null, "en", FALLBACK)).toBe(FALLBACK);
  });
});
