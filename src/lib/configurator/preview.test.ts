import { describe, it, expect } from "vitest";
import { getPreviewLayers, type SelectedCategory } from "./preview";

describe("getPreviewLayers", () => {
  it("plate photo is the bottom layer with normal blend", () => {
    const layers = getPreviewLayers("products/vietri-flat.png", []);
    expect(layers).toEqual([
      { src: "products/vietri-flat.png", blend: "normal" },
    ]);
  });

  it("step 2 without a plate shows design layers alone", () => {
    const cats: SelectedCategory[] = [
      { layerSlot: "detail", layerImage: "designs/blomster-1/details/lilla.png" },
    ];
    const layers = getPreviewLayers(null, cats);
    expect(layers).toHaveLength(1);
    expect(layers[0].blend).toBe("multiply");
  });

  it("Blomster 1: details below borders, both multiply, plate at bottom", () => {
    const cats: SelectedCategory[] = [
      { layerSlot: "top", layerImage: "b1/borders/x.png" },
      { layerSlot: "detail", layerImage: "b1/details/y.png" },
    ];
    const layers = getPreviewLayers("plate.png", cats);
    expect(layers.map((l) => l.src)).toEqual([
      "plate.png",
      "b1/details/y.png",
      "b1/borders/x.png",
    ]);
    expect(layers.map((l) => l.blend)).toEqual([
      "normal",
      "multiply",
      "multiply",
    ]);
  });

  it("Amalfi: color layers multiply, animal shape on top with normal blend", () => {
    const cats: SelectedCategory[] = [
      { layerSlot: "animal", layerImage: "ad/animal/hvale-shape.png" },
      { layerSlot: "base", layerImage: "ad/main/a.png" },
      { layerSlot: "extra", layerImage: "ad/dots/b.png" },
      { layerSlot: "mid", layerImage: "ad/plants/c.png" },
      { layerSlot: "detail", layerImage: "ad/inner/d.png" },
    ];
    const layers = getPreviewLayers("plate.png", cats);
    // shape must be last
    expect(layers[layers.length - 1]).toEqual({
      src: "ad/animal/hvale-shape.png",
      blend: "normal",
    });
    // exactly one normal among the design layers (the shape); rest multiply
    const designLayers = layers.slice(1);
    expect(designLayers.filter((l) => l.blend === "normal")).toHaveLength(1);
    expect(designLayers.filter((l) => l.blend === "multiply")).toHaveLength(4);
  });

  it("categories without a selected layer are skipped", () => {
    const cats: SelectedCategory[] = [
      { layerSlot: "detail", layerImage: null },
      { layerSlot: "top", layerImage: "b/x.png" },
    ];
    const layers = getPreviewLayers(null, cats);
    expect(layers).toHaveLength(1);
    expect(layers[0].src).toBe("b/x.png");
  });
});
