import { describe, it, expect } from "vitest";
import {
  addManyToCart,
  addToCart,
  cartPieces,
  cartTotal,
  itemCount,
  lineKey,
  lineSubtotal,
  paintLines,
  removeLine,
  unpaintedPieces,
  unpaintLines,
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

describe("cartPieces (R4-CTA-STICKY)", () => {
  it("counts physical pieces, not lines: a set of 4 taken twice is 8", () => {
    const cart = addToCart([], { ...vietriFlat, pieces: 4, quantity: 2 });
    expect(cartPieces(cart)).toBe(8);
    // itemCount still counts units — the two must not be confused
    expect(itemCount(cart)).toBe(2);
  });

  it("treats a line saved before F29 (no `pieces`) as one piece each", () => {
    const cart = addToCart([], { ...vietriFlat, quantity: 3 });
    expect(cart[0].pieces).toBeUndefined();
    expect(cartPieces(cart)).toBe(3);
  });

  it("sums across mixed lines and is zero on an empty cart", () => {
    let cart: Cart = addToCart([], { ...vietriFlat, pieces: 4, quantity: 1 });
    cart = addToCart(cart, { ...servering, quantity: 2 });
    expect(cartPieces(cart)).toBe(6);
    expect(cartPieces([])).toBe(0);
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

describe("bundle transaction (R4-upsell, D-C2)", () => {
  const baseLine = vietriFlat;
  const suggestedLine = servering;

  it("addManyToCart merges the base line onto what the cart already holds, and adds the suggestion as a new row", () => {
    // The customer already has 2 of the base product in this configuration.
    const existing = addToCart([], { ...baseLine, quantity: 2 });
    const folded = addManyToCart(existing, [
      { ...baseLine, quantity: 4 },
      suggestedLine,
    ]);

    // 2 + 4 on ONE row — not two rows for the same product::config.
    expect(folded).toHaveLength(2);
    expect(
      folded.find((l) => l.productId === baseLine.productId)?.quantity
    ).toBe(6);
    expect(folded.some((l) => l.productId === suggestedLine.productId)).toBe(
      true
    );
  });

  it("addManyToCart folds lines in order: a later line with the same key accumulates onto the earlier one, not a fresh row", () => {
    const folded = addManyToCart([], [
      { ...baseLine, quantity: 2 },
      { ...baseLine, quantity: 3 },
    ]);

    expect(folded).toHaveLength(1);
    expect(folded[0].quantity).toBe(5);
  });
});

describe("unpainted lines", () => {
  const bare: NewCartLine = { ...vietriFlat, configCode: null, configSnapshot: null };

  it("keys an unpainted line by product", () => {
    expect(lineKey("p-flat", null)).toBe("p-flat::unpainted");
  });

  it("merges two unpainted adds of the same product", () => {
    let cart = addToCart([], { ...bare, quantity: 2 });
    cart = addToCart(cart, { ...bare, quantity: 3 });
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(5);
    expect(cart[0].configCode).toBeNull();
  });

  it("keeps the unpainted line apart from the painted one", () => {
    let cart = addToCart([], vietriFlat);
    cart = addToCart(cart, bare);
    expect(cart).toHaveLength(2);
  });

  it("counts unpainted PIECES, sets included", () => {
    const cart = addToCart(addToCart([], { ...bare, quantity: 2, pieces: 3 }), vietriFlat);
    expect(unpaintedPieces(cart)).toBe(6);
  });

  it("counts nothing when every line is painted", () => {
    expect(unpaintedPieces(addToCart([], vietriFlat))).toBe(0);
  });

  const CODE = "MK-ALICI-A1";
  const snap = { designSlug: "alici", designName: "Alici", selections: [] };

  it("paints 2 of 3: a painted line of 2 and an unpainted rest of 1", () => {
    const cart = paintLines(
      addToCart([], { ...vietriFlat, configCode: null, configSnapshot: null, quantity: 3 }),
      "p-flat::unpainted",
      2,
      CODE,
      snap
    );
    expect(cart).toHaveLength(2);
    const painted = cart.find((l) => l.configCode === CODE)!;
    const rest = cart.find((l) => l.configCode === null)!;
    expect(painted.quantity).toBe(2);
    expect(painted.id).toBe(`p-flat::${CODE}`);
    expect(painted.configSnapshot).toBe(snap);
    expect(rest.quantity).toBe(1);
  });

  it("paints into an existing line of the same config instead of a second one", () => {
    let cart = addToCart([], { ...vietriFlat, configCode: CODE, quantity: 4 });
    cart = addToCart(cart, { ...vietriFlat, configCode: null, configSnapshot: null, quantity: 2 });
    cart = paintLines(cart, "p-flat::unpainted", 2, CODE, snap);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(6);
  });

  it("paints all of them: the unpainted line is gone", () => {
    const cart = paintLines(
      addToCart([], { ...vietriFlat, configCode: null, configSnapshot: null, quantity: 3 }),
      "p-flat::unpainted",
      3,
      CODE,
      snap
    );
    expect(cart).toHaveLength(1);
    expect(cart[0].configCode).toBe(CODE);
  });

  it("never moves more pieces than the line holds", () => {
    const cart = paintLines(
      addToCart([], { ...vietriFlat, configCode: null, configSnapshot: null, quantity: 2 }),
      "p-flat::unpainted",
      9,
      CODE,
      snap
    );
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
  });

  it("unpaints 2 of 4 and fuses with the unpainted line already there", () => {
    // R5-UNPAINTED test fix: a real plateImage here (the fixture leaves it
    // undefined) so the assertion below actually falsifies if unpaintLines
    // ever dropped the field — undefined === undefined would pass either way.
    let cart = addToCart([], {
      ...vietriFlat,
      configCode: CODE,
      quantity: 4,
      layers: [{ src: "a.png" }],
      plateImage: "https://example.test/plate.png",
    });
    // same product ⇒ same ceramic photo, painted or not — the pre-existing
    // bare line carries it too, exactly as a real cart would.
    cart = addToCart(cart, {
      ...vietriFlat,
      configCode: null,
      configSnapshot: null,
      quantity: 1,
      plateImage: "https://example.test/plate.png",
    });
    cart = unpaintLines(cart, `p-flat::${CODE}`, 2);
    expect(cart).toHaveLength(2);
    const bareLine = cart.find((l) => l.configCode === null)!;
    expect(bareLine.quantity).toBe(3);
    expect(bareLine.configSnapshot).toBeNull();
    expect(bareLine.layers).toBeUndefined();
    expect(bareLine.plateImage).toBe(cart.find((l) => l.configCode === CODE)!.plateImage);
    expect(cart.find((l) => l.configCode === CODE)!.quantity).toBe(2);
  });

  it("never unpaints more pieces than the line holds", () => {
    const cart = unpaintLines(
      addToCart([], { ...vietriFlat, configCode: CODE, quantity: 2 }),
      `p-flat::${CODE}`,
      9
    );
    expect(cart).toHaveLength(1);
    expect(cart[0].configCode).toBeNull();
    expect(cart[0].quantity).toBe(2);
  });

  it("unpaints all of them: the painted line is gone", () => {
    const cart = unpaintLines(
      addToCart([], { ...vietriFlat, configCode: CODE, quantity: 3 }),
      `p-flat::${CODE}`,
      3
    );
    expect(cart).toHaveLength(1);
    expect(cart[0].configCode).toBeNull();
  });

  it("does nothing on a line that is already unpainted, or on n ≤ 0", () => {
    const cart = addToCart([], { ...vietriFlat, configCode: null, configSnapshot: null, quantity: 2 });
    expect(unpaintLines(cart, "p-flat::unpainted", 1)).toEqual(cart);
    expect(paintLines(cart, "p-flat::unpainted", 0, CODE, snap)).toEqual(cart);
    expect(paintLines(cart, "nope", 1, CODE, snap)).toEqual(cart);
  });

  // The row the customer just touched must stay where it was — painting or
  // unpainting a whole line must not teleport it to the bottom of the basket.
  describe("array order", () => {
    const mug = { ...servering, productId: "p-mug", configCode: "design=other" };

    it("painting a fully-unpainted MIDDLE line leaves the painted line at the same index", () => {
      let cart = addToCart([], vietriFlat); // index 0
      cart = addToCart(cart, { ...servering, configCode: null, configSnapshot: null, quantity: 3 }); // index 1, unpainted
      cart = addToCart(cart, mug); // index 2
      cart = paintLines(cart, lineKey("p-stor", null), 3, CODE, snap);
      expect(cart).toHaveLength(3);
      expect(cart[1].productId).toBe("p-stor");
      expect(cart[1].configCode).toBe(CODE);
    });

    it("unpainting a fully-painted MIDDLE line leaves the unpainted line at the same index", () => {
      let cart = addToCart([], vietriFlat); // index 0
      cart = addToCart(cart, { ...servering, configCode: CODE, quantity: 2 }); // index 1, painted
      cart = addToCart(cart, mug); // index 2
      cart = unpaintLines(cart, lineKey("p-stor", CODE), 2);
      expect(cart).toHaveLength(3);
      expect(cart[1].productId).toBe("p-stor");
      expect(cart[1].configCode).toBeNull();
    });

    it("painting into a destination that already exists does not move that destination", () => {
      let cart = addToCart([], { ...vietriFlat, configCode: CODE, quantity: 4 }); // index 0, destination
      cart = addToCart(cart, mug); // index 1
      cart = addToCart(cart, { ...vietriFlat, configCode: null, configSnapshot: null, quantity: 2 }); // index 2, source
      cart = paintLines(cart, "p-flat::unpainted", 2, CODE, snap);
      expect(cart).toHaveLength(2);
      expect(cart[0].id).toBe(`p-flat::${CODE}`);
      expect(cart[0].quantity).toBe(6);
      expect(cart[1].productId).toBe("p-mug");
    });

    it("a partial paint still leaves the source where it was", () => {
      let cart = addToCart([], { ...servering, configCode: null, configSnapshot: null, quantity: 3 }); // index 0, source
      cart = addToCart(cart, vietriFlat); // index 1
      cart = paintLines(cart, "p-stor::unpainted", 2, CODE, snap);
      expect(cart).toHaveLength(3);
      expect(cart[0].id).toBe("p-stor::unpainted");
      expect(cart[0].quantity).toBe(1);
      expect(cart[2].id).toBe(`p-stor::${CODE}`);
    });
  });
});
