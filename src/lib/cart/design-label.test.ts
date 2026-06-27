import { describe, it, expect } from "vitest";
import { designLabel } from "./cart";

describe("designLabel — per-locale design name with legacy fallback", () => {
  it("returns the NO name on /no", () => {
    expect(
      designLabel({ designName: "Skilpadde", designNameNo: "Skilpadde", designNameEn: "Turtle" }, "no")
    ).toBe("Skilpadde");
  });

  it("returns the EN name on /en", () => {
    expect(
      designLabel({ designName: "Skilpadde", designNameNo: "Skilpadde", designNameEn: "Turtle" }, "en")
    ).toBe("Turtle");
  });

  it("falls back to legacy designName when the per-locale name is missing (historic order)", () => {
    expect(designLabel({ designName: "Skilpadde" }, "no")).toBe("Skilpadde");
    expect(designLabel({ designName: "Skilpadde" }, "en")).toBe("Skilpadde");
  });

  it("returns null for a null/undefined snapshot", () => {
    expect(designLabel(null, "no")).toBeNull();
    expect(designLabel(undefined, "en")).toBeNull();
  });

  it("returns null when no name is present at all", () => {
    expect(designLabel({}, "no")).toBeNull();
  });
});
