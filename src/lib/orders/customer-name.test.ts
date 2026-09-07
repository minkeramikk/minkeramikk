import { describe, it, expect } from "vitest";
import { displayName } from "./customer-name";

describe("displayName (R4-MAIL-COPY Ⓐ)", () => {
  it("capitalises every word, including after an apostrophe", () => {
    expect(displayName("daniele d'angeli")).toBe("Daniele D'Angeli");
  });

  it("capitalises after a hyphen", () => {
    expect(displayName("anne-lise")).toBe("Anne-Lise");
  });

  it("trims and collapses whitespace without lowercasing what is already caps", () => {
    expect(displayName("  KARI  ")).toBe("KARI");
    expect(displayName("kari   nordmann")).toBe("Kari Nordmann");
  });

  it("leaves the rest of a word exactly as written", () => {
    expect(displayName("mcDonald")).toBe("McDonald");
    expect(displayName("åse øverland")).toBe("Åse Øverland");
  });

  it("survives an empty name", () => {
    expect(displayName("   ")).toBe("");
  });
});
