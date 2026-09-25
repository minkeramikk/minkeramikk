import { describe, it, expect } from "vitest";
import { pickDefaultOption, isAtDefaultSelection } from "./default-option";

interface Opt {
  id: string;
  isDefault?: boolean;
}

describe("pickDefaultOption", () => {
  it("returns the option flagged is_default, even when it is not first", () => {
    const opts: Opt[] = [
      { id: "a" },
      { id: "b", isDefault: true },
      { id: "c" },
    ];
    expect(pickDefaultOption(opts)?.id).toBe("b");
  });

  it("falls back to the first option when none is flagged", () => {
    const opts: Opt[] = [{ id: "a" }, { id: "b" }];
    expect(pickDefaultOption(opts)?.id).toBe("a");
  });

  it("returns undefined for an empty list", () => {
    expect(pickDefaultOption([] as Opt[])).toBeUndefined();
  });

  it("returns the first flagged when several are flagged (defensive — DB index forbids it)", () => {
    const opts: Opt[] = [
      { id: "a", isDefault: true },
      { id: "b", isDefault: true },
    ];
    expect(pickDefaultOption(opts)?.id).toBe("a");
  });
});

interface Cat {
  slug: string;
  options: Opt[];
}

describe("isAtDefaultSelection (R5-PALETTE-PLACE)", () => {
  const categories: Cat[] = [
    { slug: "main-color", options: [{ id: "a", isDefault: true }, { id: "b" }] },
    { slug: "border", options: [{ id: "x" }, { id: "y", isDefault: true }] },
  ];

  it("is true when every category is still on its own default", () => {
    expect(isAtDefaultSelection(categories, { "main-color": "a", border: "y" })).toBe(true);
  });

  it("is false when even one category differs from its default", () => {
    expect(isAtDefaultSelection(categories, { "main-color": "b", border: "y" })).toBe(false);
  });

  it("is false when the design has no isDefault flag and the first option isn't selected", () => {
    const noFlag: Cat[] = [{ slug: "border", options: [{ id: "x" }, { id: "y" }] }];
    expect(isAtDefaultSelection(noFlag, { border: "y" })).toBe(false);
    expect(isAtDefaultSelection(noFlag, { border: "x" })).toBe(true);
  });

  it("is vacuously true with no categories — nothing to have chosen differently", () => {
    expect(isAtDefaultSelection([], {})).toBe(true);
  });

  it("is true for a zero-option category (selections[] is \"\", same fallback pickDefaultOption uses)", () => {
    const empty: Cat[] = [{ slug: "text", options: [] }];
    expect(isAtDefaultSelection(empty, { text: "" })).toBe(true);
  });
});
