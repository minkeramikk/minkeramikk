import { describe, it, expect } from "vitest";
import { pickDefaultOption } from "./default-option";

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
