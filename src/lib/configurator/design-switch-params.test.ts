import { describe, it, expect } from "vitest";
import { encodeConfigCode, decodeConfigCode, type CodecDesign } from "./config-code";
import { buildDesignSwitchParams } from "./design-switch-params";

const DESIGN: CodecDesign = {
  code: "T",
  slug: "text-design",
  categories: [
    { slug: "colors", optionCodeToId: { B: "colors-opt-b" }, defaultOptionId: "colors-opt-b" },
  ],
};
const OTHER_DESIGN: CodecDesign = {
  code: "O",
  slug: "other-design",
  categories: [
    { slug: "colors", optionCodeToId: { B: "colors-opt-b" }, defaultOptionId: "colors-opt-b" },
  ],
};
const SEL = { colors: "colors-opt-b" };
const findDesign = (code: string): CodecDesign | null => {
  const designs = [DESIGN, OTHER_DESIGN];
  return designs.find((d) => d.code === code.toUpperCase()) ?? null;
};

const at = (qs: string) => new URLSearchParams(qs);

/**
 * R5-DESIGN-SWITCH task 3 (AC4) — a dim-palette tap navigates `?code=` and
 * the EXISTING decode resolves the design switch; this helper only sets the
 * params that make that happen, dropping what the picked palette supersedes.
 */
describe("buildDesignSwitchParams", () => {
  it("code → params resolve to the OTHER design through the existing decode (AC4)", () => {
    const tapped = encodeConfigCode(OTHER_DESIGN, SEL, { customText: "Til Anna" });
    const next = buildDesignSwitchParams(
      at("design=text-design&opt_colors=colors-opt-b&step=2"),
      tapped,
      OTHER_DESIGN.slug
    );
    expect(next.get("code")).toBe(tapped);
    expect(next.get("design")).toBe(OTHER_DESIGN.slug);
    // and the params really do decode to the other design at the destination
    expect(decodeConfigCode(next.get("code")!, findDesign).designSlug).toBe(
      OTHER_DESIGN.slug
    );
    expect(decodeConfigCode(next.get("code")!, findDesign).customText).toBe("Til Anna");
  });

  it("drops stale opt_* — the old design's categories — on a design change", () => {
    const next = buildDesignSwitchParams(
      at("design=text-design&opt_colors=x&opt_borders=y&step=2"),
      "MK-O-B",
      OTHER_DESIGN.slug
    );
    expect([...next.keys()].filter((k) => k.startsWith("opt_"))).toEqual([]);
    expect(next.get("design")).toBe(OTHER_DESIGN.slug);
    expect(next.get("step")).toBe("2");
  });

  it("drops a stale text= — the tapped code carries its own dedication (AC4)", () => {
    const next = buildDesignSwitchParams(
      at("design=text-design&text=old+words"),
      encodeConfigCode(OTHER_DESIGN, SEL, { customText: "Til Anna" }),
      OTHER_DESIGN.slug
    );
    expect(next.get("text")).toBeNull();
    expect(next.get("code")).not.toBeNull();
  });

  it("same design (designSlug null) → only code is set, nothing else touched", () => {
    const next = buildDesignSwitchParams(
      at("design=text-design&opt_colors=colors-opt-b&step=2&note=wish"),
      "MK-T-B",
      null
    );
    expect(next.get("code")).toBe("MK-T-B");
    expect(next.get("design")).toBe("text-design");
    expect(next.get("opt_colors")).toBe("colors-opt-b");
    expect(next.get("note")).toBe("wish");
  });
});
