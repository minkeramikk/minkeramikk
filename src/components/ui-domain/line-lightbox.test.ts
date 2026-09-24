/**
 * R5-BASKET-HOST task 3 — `lineLightboxSlides` is the one branchy bit of the
 * lightbox worth a standalone test (no React test infra in this repo, see
 * AGENTS.md/vitest.config.ts): which slides exist for a line, and never an
 * empty one (mockup-lightbox.md's own rule).
 */
import { describe, expect, it } from "vitest";
import { lineLightboxSlides } from "@/components/ui-domain/line-lightbox";

const layer = { src: "https://cdn/layer.png", recolor: true };

describe("lineLightboxSlides", () => {
  it("both slides for a painted line with a photo", () => {
    expect(
      lineLightboxSlides({ plateImage: "https://cdn/plate.png", layers: [layer] })
    ).toEqual(["ceramic", "palette"]);
  });

  it("only the ceramic for an unpainted line (no layers)", () => {
    expect(
      lineLightboxSlides({ plateImage: "https://cdn/plate.png", layers: undefined })
    ).toEqual(["ceramic"]);
  });

  it("only the ceramic for a painted line with empty layers (legacy pre-F19)", () => {
    expect(lineLightboxSlides({ plateImage: "https://cdn/plate.png", layers: [] })).toEqual([
      "ceramic",
    ]);
  });

  it("only the composite when there is no photo", () => {
    expect(lineLightboxSlides({ plateImage: undefined, layers: [layer] })).toEqual(["palette"]);
  });

  it("no slides for a line with neither (never renders an empty one)", () => {
    expect(lineLightboxSlides({ plateImage: undefined, layers: undefined })).toEqual([]);
  });
});
