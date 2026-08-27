import { describe, expect, it } from "vitest";
import { laneFades } from "./lane-fades";

describe("laneFades", () => {
  it("no fades when the content fits", () => {
    expect(laneFades({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 })).toEqual({
      left: false,
      right: false,
    });
  });

  it("right fade only at the start of a scrollable lane", () => {
    expect(laneFades({ scrollLeft: 0, scrollWidth: 900, clientWidth: 300 })).toEqual({
      left: false,
      right: true,
    });
  });

  it("both fades in the middle", () => {
    expect(laneFades({ scrollLeft: 300, scrollWidth: 900, clientWidth: 300 })).toEqual({
      left: true,
      right: true,
    });
  });

  it("left fade only at the end", () => {
    expect(laneFades({ scrollLeft: 600, scrollWidth: 900, clientWidth: 300 })).toEqual({
      left: true,
      right: false,
    });
  });

  it("sub-pixel noise does not light a fade (fractional layout widths)", () => {
    // Browsers report fractional scrollWidth/clientWidth: 1.4px of slack is not
    // "there is more to scroll", it is rounding.
    expect(
      laneFades({ scrollLeft: 1.4, scrollWidth: 300.6, clientWidth: 299.4 })
    ).toEqual({ left: false, right: false });
  });
});
