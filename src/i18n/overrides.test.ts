/**
 * R4-I18N — il perimetro (AC4) e il merge (AC1/AC3), entrambi puri.
 *
 * Il merge testato qui è LO STESSO che gira nel runtime pubblico e nell'editor
 * admin: la ricerca deve trovare il testo EFFETTIVO, e una seconda
 * implementazione divergerebbe al primo salvataggio (NOTA N5 della card).
 */
import { describe, it, expect } from "vitest";
import en from "./messages/en.json";
import no from "./messages/no.json";
import {
  editableKeys,
  flattenMessages,
  isEditableKey,
  mergeOverrides,
} from "./overrides";

const BASE = {
  cart: { button: "Handlekurv", nested: { deep: "dypt" } },
  _review: "DRAFT",
};

describe("editable perimeter (AC4)", () => {
  it("flattens to next-intl's dotted keys", () => {
    expect(flattenMessages(BASE)).toEqual({
      "cart.button": "Handlekurv",
      "cart.nested.deep": "dypt",
      _review: "DRAFT",
    });
  });

  it("keeps the technical EN-only marker out of the editor", () => {
    expect(isEditableKey("_review")).toBe(false);
    expect(editableKeys(en)).not.toContain("_review");
  });

  it("exposes the content namespaces", () => {
    expect(editableKeys(no)).toContain("cart.button");
    expect(editableKeys(no)).toContain("configurator.step1.hero.title");
  });

  // NOTA N1: le due chiavi rimaste di step3 sono VIVE nel configuratore
  // (ceramics-step.tsx:113 e :1212) e devono essere modificabili.
  it("exposes the two live configurator.step3 keys", () => {
    expect(editableKeys(no)).toContain("configurator.step3.handmadeSet");
    expect(editableKeys(no)).toContain("configurator.step3.seriesCount");
  });

  // La whitelist non deve poter rompere la parità difesa da messages.test.ts.
  it("exposes exactly the same keys in both locales", () => {
    expect(editableKeys(no).sort()).toEqual(editableKeys(en).sort());
  });
});

describe("mergeOverrides", () => {
  it("returns the base itself when there is nothing to override (AC3)", () => {
    expect(mergeOverrides(BASE, {})).toBe(BASE);
  });

  it("replaces an existing string, at any depth", () => {
    const merged = mergeOverrides(BASE, { "cart.nested.deep": "endret" });
    expect(merged.cart.nested.deep).toBe("endret");
    expect(merged.cart.button).toBe("Handlekurv");
  });

  it("never mutates the base", () => {
    mergeOverrides(BASE, { "cart.button": "endret" });
    expect(BASE.cart.button).toBe("Handlekurv");
  });

  it("cannot CREATE a key — parity lives in the files, not in the DB", () => {
    const merged = mergeOverrides(BASE, { "cart.brandNew": "nope" }) as Record<
      string,
      Record<string, unknown>
    >;
    expect(merged.cart.brandNew).toBeUndefined();
  });

  it("cannot replace an object node with a string", () => {
    const merged = mergeOverrides(BASE, { "cart.nested": "nope" });
    expect(merged.cart.nested).toEqual({ deep: "dypt" });
  });

  it("ignores a row whose namespace is not on the whitelist", () => {
    const merged = mergeOverrides(BASE, { _review: "nope" });
    expect(merged._review).toBe("DRAFT");
  });

  it("survives a key whose path runs through a missing node", () => {
    expect(() => mergeOverrides(BASE, { "cart.a.b.c": "x" })).not.toThrow();
  });
});
