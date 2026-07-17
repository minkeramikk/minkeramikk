import { describe, expect, it } from "vitest";
import { formatSelections } from "./readable-selections";

const sels = [
  { label: "Kanter", labelEn: "Edges", option: "Verde Smeraldo", hex: "#0a7" },
  { label: "Detaljer", labelEn: "Details", option: "Alici", hex: null },
];

describe("formatSelections", () => {
  it("with labels, NO uses the canonical label", () => {
    expect(formatSelections(sels, "no", { withLabels: true })).toBe(
      "Kanter: Verde Smeraldo · Detaljer: Alici"
    );
  });

  it("with labels, EN uses labelEn", () => {
    expect(formatSelections(sels, "en", { withLabels: true })).toBe(
      "Edges: Verde Smeraldo · Details: Alici"
    );
  });

  it("EN falls back to the NO label when labelEn is missing", () => {
    expect(
      formatSelections([{ label: "Kanter", option: "X", hex: null }], "en", {
        withLabels: true,
      })
    ).toBe("Kanter: X");
  });

  it("options-only mode drops the labels", () => {
    expect(formatSelections(sels, "no")).toBe("Verde Smeraldo · Alici");
  });

  it("empty selections → empty string", () => {
    expect(formatSelections([], "no", { withLabels: true })).toBe("");
  });
});
