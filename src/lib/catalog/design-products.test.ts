import { describe, it, expect } from "vitest";
import { effectiveProducts, productsWithForeignSupplier } from "./design-products";

const P = (id: string) => ({ id });

describe("effectiveProducts", () => {
  it("empty whitelist → all products unchanged (retro-compat)", () => {
    const all = [P("a"), P("b"), P("c")];
    expect(effectiveProducts([], all)).toEqual(all);
  });

  it("non-empty whitelist → only whitelisted, order of `all` preserved", () => {
    const all = [P("a"), P("b"), P("c")];
    expect(effectiveProducts(["c", "a"], all)).toEqual([P("a"), P("c")]);
  });

  it("whitelist id not in the (visible) supplier list → dropped (AC4 intersection)", () => {
    const all = [P("a"), P("b")]; // 'hidden' is not here → excluded even if whitelisted
    expect(effectiveProducts(["a", "hidden"], all)).toEqual([P("a")]);
  });

  it("whitelist that intersects nothing visible → empty (AC4 empty state)", () => {
    expect(effectiveProducts(["hidden"], [P("a")])).toEqual([]);
  });
});

describe("productsWithForeignSupplier", () => {
  it("all same supplier → no offenders", () => {
    expect(
      productsWithForeignSupplier("s1", [
        { id: "a", supplierId: "s1" },
        { id: "b", supplierId: "s1" },
      ])
    ).toEqual([]);
  });

  it("returns ids belonging to another supplier", () => {
    expect(
      productsWithForeignSupplier("s1", [
        { id: "a", supplierId: "s1" },
        { id: "b", supplierId: "s2" },
      ])
    ).toEqual(["b"]);
  });
});
