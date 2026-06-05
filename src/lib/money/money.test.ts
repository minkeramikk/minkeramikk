import { describe, expect, it } from "vitest";
import {
  CurrencyMismatchError,
  InvalidAmountError,
  add,
  equals,
  formatMoney,
  fromMajorUnits,
  money,
  multiply,
  sum,
} from "./money";

describe("money()", () => {
  it("creates an immutable value from minor units", () => {
    const m = money(50_000, "NOK");
    expect(m.amountCents).toBe(50_000);
    expect(m.currency).toBe("NOK");
    expect(Object.isFrozen(m)).toBe(true);
  });

  it("defaults to NOK", () => {
    expect(money(100).currency).toBe("NOK");
  });

  it("rejects non-integer amounts", () => {
    expect(() => money(10.5)).toThrow(InvalidAmountError);
    expect(() => money(Number.NaN)).toThrow(InvalidAmountError);
    expect(() => money(Number.MAX_SAFE_INTEGER + 1)).toThrow(InvalidAmountError);
  });
});

describe("fromMajorUnits()", () => {
  it("converts whole kroner to øre", () => {
    expect(fromMajorUnits(500).amountCents).toBe(50_000);
    expect(fromMajorUnits(13.5, "EUR").amountCents).toBe(1_350);
  });

  it("rejects sub-cent precision", () => {
    expect(() => fromMajorUnits(1.999)).toThrow(InvalidAmountError);
  });
});

describe("add()", () => {
  it("adds same-currency amounts", () => {
    expect(add(money(100), money(250)).amountCents).toBe(350);
  });

  it("refuses cross-currency addition", () => {
    expect(() => add(money(100, "NOK"), money(100, "EUR"))).toThrow(
      CurrencyMismatchError,
    );
  });
});

describe("multiply()", () => {
  it("multiplies by a quantity", () => {
    // 4 × Vietri Flat (500 kr)
    expect(multiply(money(50_000), 4).amountCents).toBe(200_000);
  });

  it("allows zero quantity", () => {
    expect(multiply(money(50_000), 0).amountCents).toBe(0);
  });

  it("rejects negative or fractional quantities", () => {
    expect(() => multiply(money(100), -1)).toThrow(InvalidAmountError);
    expect(() => multiply(money(100), 1.5)).toThrow(InvalidAmountError);
  });
});

describe("sum()", () => {
  it("sums a mixed cart of one currency", () => {
    // the MK-2606 order: 4 × 500 kr + 1 × 1300 kr = 3300 kr
    const lines = [multiply(money(50_000), 4), multiply(money(130_000), 1)];
    expect(sum(lines).amountCents).toBe(330_000);
  });

  it("returns zero for an empty cart", () => {
    expect(equals(sum([]), money(0))).toBe(true);
  });

  it("refuses mixed currencies", () => {
    expect(() => sum([money(100, "NOK"), money(100, "GBP")])).toThrow(
      CurrencyMismatchError,
    );
  });
});

describe("formatMoney()", () => {
  it("formats whole NOK without decimals, Norwegian style", () => {
    const text = formatMoney(money(130_000), "no");
    expect(text).toContain("kr");
    expect(text).toMatch(/1\s?300/); // grouped thousands, no decimals
    expect(text).not.toMatch(/,00|\.00/);
  });

  it("formats for the English locale", () => {
    const text = formatMoney(money(130_000), "en");
    expect(text).toMatch(/NOK|kr/);
    expect(text).toMatch(/1,300|1\s?300/);
  });

  it("keeps decimals when the amount has them", () => {
    const text = formatMoney(money(1_350, "EUR"), "en");
    expect(text).toContain("13.50");
  });
});
