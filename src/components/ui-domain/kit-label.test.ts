import { describe, it, expect } from "vitest";
import { encodeKitLabel, decodeKitLabel } from "./kit-strip";

describe("kit label codec", () => {
  it("round-trips a bilingual label", () => {
    const label = { no: "Mitt kit", en: "My kit" };
    expect(decodeKitLabel(encodeKitLabel(label))).toEqual(label);
  });

  it("survives non-latin1 characters (æøå, emoji)", () => {
    const label = { no: "Blåbær-kit æøå", en: "Blueberry kit 🎨" };
    expect(decodeKitLabel(encodeKitLabel(label))).toEqual(label);
  });

  it("returns null on garbage", () => {
    expect(decodeKitLabel(null)).toBeNull();
    expect(decodeKitLabel("")).toBeNull();
    expect(decodeKitLabel("!!!not-base64!!!")).toBeNull();
  });
});
