import { describe, expect, it } from "vitest";
import type { Cart, CartLine } from "./cart";
import {
  SAVED_CART_KEY,
  SAVED_CART_VERSION,
  buildRestoredCart,
  needsSwapConfirm,
  parseSavedCart,
  savedPieces,
  serializeSavedCart,
  snapshotCart,
  swapCarts,
  type ValidatedEntry,
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

/** Risposta "tutto ancora valido" per una riga: il server rimanda la riga viva. */
function okEntry(l: CartLine, over: Partial<ValidatedEntry> = {}): ValidatedEntry {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `id` è locale: il server rimanda la riga senza identità
  const { id: _id, ...rest } = l;
  return {
    ok: true,
    line: rest,
    acceptsCustomNotes: true,
    acceptsCustomText: true,
    ...over,
  } as ValidatedEntry;
}

describe("buildRestoredCart (AC4/AC5)", () => {
  it("restores every field identically when nothing changed (AC4)", () => {
    const saved = snapshotCart([line()], NOW);
    const { cart, report } = buildRestoredCart(saved, [okEntry(saved.lines[0])]);
    expect(cart).toEqual(saved.lines);
    expect(report).toEqual({ removed: [], adapted: [] });
  });

  it("takes the live price/name from the server, the quantity from the slot", () => {
    const saved = snapshotCart([line({ quantity: 3 })], NOW);
    const fresh = { ...saved.lines[0], unitPriceCents: 99000, productNameNo: "Vietri sett 2026", quantity: 1 };
    const { cart } = buildRestoredCart(saved, [okEntry(fresh)]);
    expect(cart[0].unitPriceCents).toBe(99000);
    expect(cart[0].productNameNo).toBe("Vietri sett 2026");
    expect(cart[0].quantity).toBe(3);
  });

  it("reports a removed design and a removed product, never drops them silently (AC5)", () => {
    const a = line({ id: "a", productId: "a", configCode: "MK-A-B" });
    const b = line({ id: "b", productId: "b", configCode: "MK-C-D" });
    const c = line({ id: "c", productId: "c", configCode: "MK-E-F" });
    const saved = snapshotCart([a, b, c], NOW);
    const { cart, report } = buildRestoredCart(saved, [
      { ok: false, reason: "design" },
      okEntry(saved.lines[1]),
      { ok: false, reason: "product" },
    ]);
    expect(cart).toHaveLength(1);
    expect(cart[0].productId).toBe("b");
    expect(report.removed.map((r) => [r.line.productId, r.reason])).toEqual([
      ["a", "design"],
      ["c", "product"],
    ]);
  });

  it("flags an options adaptation when the canonical code changed", () => {
    const saved = snapshotCart([line()], NOW);
    const fresh = { ...saved.lines[0], configCode: "MK-A-Z" };
    const { cart, report } = buildRestoredCart(saved, [okEntry(fresh)]);
    expect(report.adapted[0].changes).toEqual(["options"]);
    expect(cart[0].configCode).toBe("MK-A-Z");
    expect(cart[0].id).toBe("p1::MK-A-Z"); // identity recomputed from the fresh code
  });

  it("keeps note and inscription when still allowed, drops+reports them when not (AC5)", () => {
    const saved = snapshotCart([line()], NOW);
    const serverSnapshot = { ...saved.lines[0].configSnapshot!, customNote: undefined, customText: undefined };
    const fresh = { ...saved.lines[0], configSnapshot: serverSnapshot };

    const kept = buildRestoredCart(saved, [okEntry(fresh)]);
    expect(kept.cart[0].configSnapshot?.customNote).toBe("litt mer blått");
    expect(kept.cart[0].configSnapshot?.customText).toBe("Til Kari");
    expect(kept.report.adapted).toEqual([]);

    const dropped = buildRestoredCart(saved, [
      okEntry(fresh, { acceptsCustomNotes: false, acceptsCustomText: false }),
    ]);
    expect(dropped.cart[0].configSnapshot?.customNote).toBeUndefined();
    expect(dropped.cart[0].configSnapshot?.customText).toBeUndefined();
    expect(dropped.report.adapted[0].changes).toEqual(["note", "text"]);
  });

  it("merges two saved lines that collapse onto the same identity", () => {
    const saved = snapshotCart([line({ quantity: 1 }), line({ id: "other", quantity: 2 })], NOW);
    const { cart } = buildRestoredCart(saved, [okEntry(saved.lines[0]), okEntry(saved.lines[0])]);
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(3);
  });

  it("treats a missing/short server answer as removed, not as a crash", () => {
    const saved = snapshotCart([line()], NOW);
    const { cart, report } = buildRestoredCart(saved, []);
    expect(cart).toEqual([]);
    expect(report.removed).toHaveLength(1);
    expect(report.removed[0].reason).toBe("design");
  });
});
