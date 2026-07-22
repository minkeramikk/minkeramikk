import { describe, expect, it } from "vitest";
import type { Cart, CartLine } from "./cart";
import {
  SAVED_CART_KEY,
  SAVED_CART_VERSION,
  needsSwapConfirm,
  parseSavedCart,
  savedPieces,
  serializeSavedCart,
  snapshotCart,
  swapCarts,
} from "./saved-cart";

const NOW = new Date("2026-07-21T10:00:00.000Z");

export function line(over: Partial<CartLine> = {}): CartLine {
  return {
    id: "p1::MK-A-B",
    productId: "p1",
    productNameNo: "Vietri sett",
    productNameEn: "Vietri set",
    supplierId: "s1",
    supplierName: "Vietri",
    unitPriceCents: 95000,
    currency: "NOK",
    quantity: 1,
    configCode: "MK-A-B",
    configSnapshot: {
      designSlug: "amalfi-animals",
      designName: "Amalfi animals",
      designNameNo: "Amalfi animals",
      designNameEn: "Amalfi animals",
      selections: [{ label: "Farge", labelEn: "Colour", option: "Blå", hex: "#123456" }],
      customNote: "litt mer blått",
      customText: "Til Kari",
    },
    layers: [{ src: "/a.png", recolor: true }],
    plateImage: "/plate.png",
    productSlug: "vietri-set",
    pieces: 2,
    ...over,
  };
}

describe("snapshotCart", () => {
  it("stamps version + savedAt and keeps every line field (AC4)", () => {
    const cart: Cart = [line()];
    const saved = snapshotCart(cart, NOW);
    expect(saved.version).toBe(SAVED_CART_VERSION);
    expect(saved.savedAt).toBe("2026-07-21T10:00:00.000Z");
    expect(saved.lines).toEqual(cart);
  });

  it("is a copy: mutating the cart afterwards does not touch the slot", () => {
    const cart: Cart = [line()];
    const saved = snapshotCart(cart, NOW);
    cart[0].quantity = 99;
    expect(saved.lines[0].quantity).toBe(1);
  });
});

describe("parseSavedCart (AC6)", () => {
  it("returns empty for null, empty string and garbage", () => {
    expect(parseSavedCart(null).kind).toBe("empty");
    expect(parseSavedCart("").kind).toBe("empty");
    expect(parseSavedCart("{not json").kind).toBe("empty");
    expect(parseSavedCart("[]").kind).toBe("empty");
    expect(parseSavedCart(JSON.stringify({ version: 1, savedAt: "x" })).kind).toBe("empty");
  });

  it("round-trips a saved cart", () => {
    const saved = snapshotCart([line()], NOW);
    const parsed = parseSavedCart(serializeSavedCart(saved));
    expect(parsed).toEqual({ kind: "ok", saved });
  });

  it("degrades cleanly on an unknown future version, never throws", () => {
    const raw = JSON.stringify({ version: 99, savedAt: NOW.toISOString(), lines: [line()] });
    expect(parseSavedCart(raw)).toEqual({ kind: "unsupported", version: 99 });
  });

  it("treats a slot with zero lines as empty", () => {
    expect(parseSavedCart(serializeSavedCart(snapshotCart([], NOW))).kind).toBe("empty");
  });
});

describe("needsSwapConfirm (AC2/AC3)", () => {
  const slot = snapshotCart([line()], NOW);
  it("asks only when BOTH sides hold something", () => {
    expect(needsSwapConfirm([line()], slot)).toBe(true);
    expect(needsSwapConfirm([], slot)).toBe(false); // restore on an empty cart
    expect(needsSwapConfirm([line()], null)).toBe(false); // save on an empty slot
    expect(needsSwapConfirm([], null)).toBe(false);
  });
});

describe("swapCarts (AC2 — never loses anything)", () => {
  it("save on an empty slot: cart empties, slot takes it", () => {
    const current: Cart = [line()];
    const out = swapCarts(current, [], NOW);
    expect(out.cart).toEqual([]);
    expect(out.slot?.lines).toEqual(current);
  });

  it("restore on an empty cart: slot empties, cart takes it", () => {
    const restored: Cart = [line()];
    const out = swapCarts([], restored, NOW);
    expect(out.cart).toEqual(restored);
    expect(out.slot).toBeNull();
  });

  it("both full: the two sides exchange, nothing is dropped", () => {
    const current: Cart = [line({ id: "cur", productId: "cur" })];
    const restored: Cart = [line({ id: "sav", productId: "sav" })];
    const out = swapCarts(current, restored, NOW);
    expect(out.cart).toEqual(restored);
    expect(out.slot?.lines).toEqual(current);
    const survivors = [...out.cart, ...(out.slot?.lines ?? [])].map((l) => l.productId);
    expect(survivors.sort()).toEqual(["cur", "sav"]);
  });
});

describe("savedPieces", () => {
  it("sums the quantities, like the header badge", () => {
    expect(savedPieces(snapshotCart([line({ quantity: 2 }), line({ id: "b", quantity: 1 })], NOW))).toBe(3);
  });
});

it("storage key follows the existing naming", () => {
  expect(SAVED_CART_KEY).toBe("mk-saved-cart-v1");
});
