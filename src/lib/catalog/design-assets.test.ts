import { describe, it, expect } from "vitest";
import {
  isExternalUrl,
  isStoragePath,
  isOwnedByDesign,
  remapOwnedAsset,
  planAssetCopy,
  ownedAssetsToDelete,
} from "./design-assets";

describe("asset classification", () => {
  it("external URLs vs storage paths", () => {
    expect(isExternalUrl("https://cdn/x.png")).toBe(true);
    expect(isExternalUrl("designs/a/x.png")).toBe(false);
    expect(isStoragePath("designs/a/x.png")).toBe(true);
    expect(isStoragePath("https://cdn/x.png")).toBe(false);
    expect(isStoragePath("")).toBe(false);
  });

  it("treats design-photos/<slug>/ as owned and remaps within that base", () => {
    expect(isOwnedByDesign("design-photos/ansjos-stim/ab12.jpg", "ansjos-stim")).toBe(true);
    expect(remapOwnedAsset("design-photos/ansjos-stim/ab12.jpg", "ansjos-stim", "ansjos-stim-copy"))
      .toBe("design-photos/ansjos-stim-copy/ab12.jpg");
    expect(planAssetCopy("design-photos/ansjos-stim/ab12.jpg", "ansjos-stim", "clone"))
      .toEqual({ from: "design-photos/ansjos-stim/ab12.jpg", to: "design-photos/clone/ab12.jpg" });
    expect(ownedAssetsToDelete(["design-photos/ansjos-stim/ab12.jpg", "swatches/aaa.png"], "ansjos-stim"))
      .toEqual(["design-photos/ansjos-stim/ab12.jpg"]);
  });

  it("still owns and remaps designs/<slug>/ layers (unchanged)", () => {
    expect(isOwnedByDesign("designs/ansjos-stim/dots/lilla.png", "ansjos-stim")).toBe(true);
    expect(remapOwnedAsset("designs/ansjos-stim/dots/lilla.png", "ansjos-stim", "clone"))
      .toBe("designs/clone/dots/lilla.png");
  });

  it("ownership is scoped to designs/<slug>/", () => {
    expect(isOwnedByDesign("designs/amalfi/animal/h-layer.png", "amalfi")).toBe(true);
    expect(isOwnedByDesign("designs/amalfi/animal/h-layer.png", "blomster")).toBe(false);
    expect(isOwnedByDesign("swatches/123abc.png", "amalfi")).toBe(false); // shared
    expect(isOwnedByDesign("https://cdn/h.png", "amalfi")).toBe(false); // external
    // guard against a slug being a prefix of another (designs/amalfi vs amalfi-2)
    expect(isOwnedByDesign("designs/amalfi-2/x.png", "amalfi")).toBe(false);
  });
});

describe("remapOwnedAsset", () => {
  it("re-paths owned assets, leaves shared/external untouched", () => {
    expect(remapOwnedAsset("designs/amalfi/farge/lilla-layer.png", "amalfi", "amalfi-copy")).toBe(
      "designs/amalfi-copy/farge/lilla-layer.png"
    );
    expect(remapOwnedAsset("swatches/abc.png", "amalfi", "amalfi-copy")).toBe("swatches/abc.png");
    expect(remapOwnedAsset("https://cdn/h.png", "amalfi", "amalfi-copy")).toBe("https://cdn/h.png");
  });
});

describe("planAssetCopy (clone)", () => {
  it("plans a copy only for owned storage assets", () => {
    expect(planAssetCopy("designs/amalfi/x-layer.png", "amalfi", "copy")).toEqual({
      from: "designs/amalfi/x-layer.png",
      to: "designs/copy/x-layer.png",
    });
    expect(planAssetCopy("swatches/abc.png", "amalfi", "copy")).toBeNull(); // shared → reference
    expect(planAssetCopy("https://cdn/h.png", "amalfi", "copy")).toBeNull(); // external → reference
    expect(planAssetCopy(null, "amalfi", "copy")).toBeNull();
    expect(planAssetCopy(undefined, "amalfi", "copy")).toBeNull();
  });
});

describe("ownedAssetsToDelete (delete)", () => {
  it("returns only this design's storage objects, deduped, keeps shared/external", () => {
    const paths = [
      "designs/amalfi/preview.png",
      "designs/amalfi/farge/lilla-layer.png",
      "designs/amalfi/farge/lilla-layer.png", // dup
      "swatches/abc.png", // shared
      "https://cdn/h.png", // external
      "designs/other/x.png", // another design
      null,
      undefined,
    ];
    expect(ownedAssetsToDelete(paths, "amalfi").sort()).toEqual(
      ["designs/amalfi/farge/lilla-layer.png", "designs/amalfi/preview.png"].sort()
    );
  });
});
