import { describe, it, expect } from "vitest";
import { mapOptionRow } from "./design-options";

describe("mapOptionRow", () => {
  it("colour option pulls name/hex/image from the palette join", () => {
    expect(
      mapOptionRow({
        id: "o1",
        code: "A",
        name: null,
        image: null,
        hex: null,
        layer_image: "designs/x/y/o1-layer-ab12.png",
        sort_order: 0,
        active: true,
        is_default: true,
        supplier_colors: {
          name: "Havblå",
          hex: "#0160b2",
          swatch_image: "suppliers/s1/colors/0160b2-ab12.png",
        },
      })
    ).toEqual({
      id: "o1",
      code: "A",
      name: "Havblå",
      hex: "#0160b2",
      image: "suppliers/s1/colors/0160b2-ab12.png",
      layerImage: "designs/x/y/o1-layer-ab12.png",
      isDefault: true,
    });
  });

  it("image option keeps its own name/image, palette is null", () => {
    expect(
      mapOptionRow({
        id: "o2",
        code: "B",
        name: "Fox",
        image: "designs/x/animal/fox.png",
        hex: null,
        layer_image: "designs/x/animal/fox-layer.png",
        sort_order: 1,
        active: true,
        is_default: false,
        supplier_colors: null,
      })
    ).toMatchObject({ name: "Fox", hex: null, image: "designs/x/animal/fox.png" });
  });
});
