import { describe, it, expect } from "vitest";
import {
  addToCart,
  cartTotal,
  itemCount,
  lineSubtotal,
  removeLine,
  updateQuantity,
  type Cart,
  type NewCartLine,
} from "./cart";
import { formatMoney } from "@/lib/money/money";

const vietriFlat: NewCartLine = {
  productId: "p-flat",
  productNameNo: "Vietri Flat",
  productNameEn: "Vietri Flat",
  supplierId: "s-vietri",
  supplierName: "Vietri",
  unitPriceCents: 50_000,
  currency: "NOK",
  configCode: "design=blomster-1&opt_details=a",
  configSnapshot: null,
};

const servering: NewCartLine = {
  ...vietriFlat,
  productId: "p-stor",
  productNameNo: "Serveringsfat Stor",
  productNameEn: "Serving dish, large",
  unitPriceCents: 130_000,
  configCode: "design=krabbe&opt_colors=b",
};

describe("cart store", () => {
  it("adds a line with default quantity 1", () => {
    const cart = addToCart([], vietriFlat);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(1);
    expect(cart[0].id).toBe("p-flat::design=blomster-1&opt_details=a");
  });

  it("merges quantity when the same product + config is added again", () => {
    let cart = addToCart([], { ...vietriFlat, quantity: 2 });
    cart = addToCart(cart, { ...vietriFlat, quantity: 3 });
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(5);
  });

  it("keeps separate lines for the same product with a different config", () => {
    let cart = addToCart([], vietriFlat);
    cart = addToCart(cart, { ...vietriFlat, configCode: "design=striper" });
    expect(cart).toHaveLength(2);
  });

  it("updates a line quantity", () => {
    let cart = addToCart([], vietriFlat);
    cart = updateQuantity(cart, cart[0].id, 4);
    expect(cart[0].quantity).toBe(4);
  });

  it("removes a line when quantity drops to 0", () => {
    let cart = addToCart([], vietriFlat);
    cart = updateQuantity(cart, cart[0].id, 0);
    expect(cart).toHaveLength(0);
  });

  it("removes a line explicitly", () => {
    let cart = addToCart([], vietriFlat);
    cart = removeLine(cart, cart[0].id);
    expect(cart).toHaveLength(0);
  });

  it("computes line subtotal via Money (no float)", () => {
    const cart = addToCart([], { ...vietriFlat, quantity: 4 });
    expect(lineSubtotal(cart[0]).amountCents).toBe(200_000);
  });

  it("computes a multi-line total in cents (the MK-2606 cart = 3300 kr)", () => {
    let cart: Cart = addToCart([], { ...vietriFlat, quantity: 4 }); // 4×500
    cart = addToCart(cart, { ...servering, quantity: 1 }); // 1×1300
    const total = cartTotal(cart);
    expect(total.amountCents).toBe(330_000);
    expect(total.currency).toBe("NOK");
    expect(formatMoney(total, "no")).toMatch(/3\s?300/);
  });

  it("supports a mixed-supplier cart (ADR 0007): each line keeps its supplier", () => {
    let cart = addToCart([], {
      ...vietriFlat,
      supplierId: "s-vietri",
      supplierName: "Vietri",
    });
    cart = addToCart(cart, {
      ...servering,
      supplierId: "s-other",
      supplierName: "Amalfi Studio",
    });
    expect(cart.map((l) => l.supplierName)).toEqual(["Vietri", "Amalfi Studio"]);
    // total still sums (single currency)
    expect(cartTotal(cart).amountCents).toBe(180_000);
  });

  it("empty cart totals to zero", () => {
    expect(cartTotal([]).amountCents).toBe(0);
    expect(itemCount([])).toBe(0);
  });
});

describe("cart line layers (F19)", () => {
  const withLayers: NewCartLine = {
    ...vietriFlat,
    layers: [
      { src: "https://cdn/pattern-a.png", recolor: true },
      { src: "https://cdn/pattern-b.png", recolor: true },
    ],
    plateImage: "https://cdn/vietri-flat.png",
  };

  it("preserves layers + plateImage when adding", () => {
    const cart = addToCart([], withLayers);
    expect(cart[0].layers).toHaveLength(2);
    expect(cart[0].layers?.[1].recolor).toBe(true);
    expect(cart[0].plateImage).toBe("https://cdn/vietri-flat.png");
  });

  it("survives a JSON persist/hydrate round-trip", () => {
    const cart = addToCart([], withLayers);
    const hydrated: Cart = JSON.parse(JSON.stringify(cart));
    expect(hydrated[0].layers).toEqual(withLayers.layers);
    expect(hydrated[0].plateImage).toBe(withLayers.plateImage);
  });

  it("retro-compat: a pre-F19 line has no layers and still works", () => {
    const legacy = addToCart([], vietriFlat); // no layers
    expect(legacy[0].layers).toBeUndefined();
    const bumped = updateQuantity(legacy, legacy[0].id, 3);
    expect(bumped[0].layers).toBeUndefined();
    expect(bumped[0].quantity).toBe(3);
    const hydrated: Cart = JSON.parse(JSON.stringify(bumped));
    expect("layers" in hydrated[0]).toBe(false); // stays layerless, no crash
  });

  it("merging the same config keeps the existing layers", () => {
    let cart = addToCart([], withLayers);
    cart = addToCart(cart, { ...withLayers, layers: undefined });
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
    expect(cart[0].layers).toHaveLength(2);
  });
});
