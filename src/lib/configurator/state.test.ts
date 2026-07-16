import { describe, it, expect } from "vitest";
import {
  configuratorReducer,
  initialConfiguratorState,
  type ConfiguratorAction,
  type SyncCategory,
} from "./state";
import { mapOptionRow } from "@/lib/catalog/design-options";

const select = (slug: string, supplierId: string): ConfiguratorAction => ({
  type: "selectDesign",
  design: { slug, supplierId },
});

describe("configuratorReducer — step 1 (design)", () => {
  it("starts with no design and no supplier", () => {
    expect(initialConfiguratorState.designSlug).toBeNull();
    expect(initialConfiguratorState.supplierId).toBeNull();
  });

  it("selecting a design exposes its supplierId (AC3 F01)", () => {
    const s = configuratorReducer(initialConfiguratorState, select("blomster-1", "v"));
    expect(s.designSlug).toBe("blomster-1");
    expect(s.supplierId).toBe("v");
  });

  it("selecting a different design replaces slug AND supplier and resets selections", () => {
    let s = configuratorReducer(initialConfiguratorState, select("blomster-1", "a"));
    s = configuratorReducer(s, {
      type: "selectOption",
      categorySlug: "details",
      optionId: "o1",
    });
    s = configuratorReducer(s, select("krabbe", "b"));
    expect(s.designSlug).toBe("krabbe");
    expect(s.supplierId).toBe("b");
    expect(s.selections).toEqual({});
  });

  it("re-selecting the same design is a no-op (same reference)", () => {
    const first = configuratorReducer(initialConfiguratorState, select("juletre", "a"));
    expect(configuratorReducer(first, select("juletre", "a"))).toBe(first);
  });
});

describe("configuratorReducer — step 2 (options + color lock)", () => {
  it("records the selected option per category", () => {
    const s = configuratorReducer(initialConfiguratorState, {
      type: "selectOption",
      categorySlug: "details",
      optionId: "opt-lilla",
    });
    expect(s.selections.details).toBe("opt-lilla");
  });

  // Krabbe color lock (sync_group "crab"): colors ↔ borders, matched by hex.
  const crabCategories: SyncCategory[] = [
    {
      slug: "colors",
      syncGroup: "crab",
      optionHex: { "c-lilla": "#ae9def", "c-blu": "#001c81" },
      hexToOption: { "#ae9def": "c-lilla", "#001c81": "c-blu" },
    },
    {
      slug: "borders",
      syncGroup: "crab",
      optionHex: { "b-lilla": "#ae9def", "b-blu": "#001c81" },
      hexToOption: { "#ae9def": "b-lilla", "#001c81": "b-blu" },
    },
  ];

  it("lock ON: choosing a color syncs the sibling category by hex", () => {
    let s = configuratorReducer(initialConfiguratorState, {
      type: "setColorLock",
      locked: true,
    });
    s = configuratorReducer(s, {
      type: "selectOption",
      categorySlug: "colors",
      optionId: "c-blu",
      categories: crabCategories,
    });
    expect(s.selections.colors).toBe("c-blu");
    expect(s.selections.borders).toBe("b-blu"); // synced by #001c81
  });

  it("lock OFF: categories stay independent", () => {
    const s = configuratorReducer(initialConfiguratorState, {
      type: "selectOption",
      categorySlug: "colors",
      optionId: "c-blu",
      categories: crabCategories,
    });
    expect(s.selections.colors).toBe("c-blu");
    expect(s.selections.borders).toBeUndefined();
  });

  it("lock ON but no hex match: sibling is left unchanged (no crash)", () => {
    let s = configuratorReducer(initialConfiguratorState, {
      type: "setColorLock",
      locked: true,
    });
    const noMatch: SyncCategory[] = [
      {
        slug: "colors",
        syncGroup: "crab",
        optionHex: { "c-x": "#123456" },
        hexToOption: { "#123456": "c-x" },
      },
      {
        slug: "borders",
        syncGroup: "crab",
        optionHex: { "b-y": "#abcdef" },
        hexToOption: { "#abcdef": "b-y" },
      },
    ];
    s = configuratorReducer(s, {
      type: "selectOption",
      categorySlug: "colors",
      optionId: "c-x",
      categories: noMatch,
    });
    expect(s.selections.colors).toBe("c-x");
    expect(s.selections.borders).toBeUndefined();
  });

  // F35 (ADR 0018): after normalisation the DTO's hex comes from the palette
  // join (mapOptionRow), not from options.hex. The color lock keys on that hex,
  // so it must still sync — i.e. state.ts needs NO change. Build the SyncCategory
  // hexes straight from mapOptionRow output to pin that invariant.
  it("lock ON: palette-derived hex (mapOptionRow) still drives the color lock", () => {
    const pal = (name: string, hex: string) => ({ name, hex, swatch_image: null });
    const colorsOpt = mapOptionRow({
      id: "c-blu", code: null, name: null, image: null, hex: null,
      layer_image: null, sort_order: 0, active: true, is_default: false,
      supplier_colors: pal("Blu Antico", "#0160b2"),
    });
    const bordersOpt = mapOptionRow({
      id: "b-blu", code: null, name: null, image: null, hex: null,
      layer_image: null, sort_order: 0, active: true, is_default: false,
      supplier_colors: pal("Blu Antico", "#0160b2"),
    });
    // both resolved their hex from the palette
    expect(colorsOpt.hex).toBe("#0160b2");

    const categories: SyncCategory[] = [
      {
        slug: "colors",
        syncGroup: "vietri",
        optionHex: { [colorsOpt.id]: colorsOpt.hex },
        hexToOption: { [colorsOpt.hex!]: colorsOpt.id },
      },
      {
        slug: "borders",
        syncGroup: "vietri",
        optionHex: { [bordersOpt.id]: bordersOpt.hex },
        hexToOption: { [bordersOpt.hex!]: bordersOpt.id },
      },
    ];

    let s = configuratorReducer(initialConfiguratorState, {
      type: "setColorLock",
      locked: true,
    });
    s = configuratorReducer(s, {
      type: "selectOption",
      categorySlug: "colors",
      optionId: "c-blu",
      categories,
    });
    expect(s.selections.colors).toBe("c-blu");
    expect(s.selections.borders).toBe("b-blu"); // synced by the palette hex #0160b2
  });

  it("lock ON: categories in a different (or null) sync_group are not synced", () => {
    let s = configuratorReducer(initialConfiguratorState, {
      type: "setColorLock",
      locked: true,
    });
    const mixed: SyncCategory[] = [
      {
        slug: "details",
        syncGroup: null,
        optionHex: { d1: "#ae9def" },
        hexToOption: { "#ae9def": "d1" },
      },
      {
        slug: "borders",
        syncGroup: null,
        optionHex: { b1: "#ae9def" },
        hexToOption: { "#ae9def": "b1" },
      },
    ];
    s = configuratorReducer(s, {
      type: "selectOption",
      categorySlug: "details",
      optionId: "d1",
      categories: mixed,
    });
    expect(s.selections.borders).toBeUndefined();
  });
});
