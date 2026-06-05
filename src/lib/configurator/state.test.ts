import { describe, it, expect } from "vitest";
import {
  configuratorReducer,
  initialConfiguratorState,
  type ConfiguratorAction,
} from "./state";

const select = (slug: string, supplierId: string): ConfiguratorAction => ({
  type: "selectDesign",
  design: { slug, supplierId },
});

describe("configuratorReducer", () => {
  it("starts with no design and no supplier", () => {
    expect(initialConfiguratorState.designSlug).toBeNull();
    expect(initialConfiguratorState.supplierId).toBeNull();
  });

  it("selecting a design exposes its supplierId (AC3)", () => {
    const state = configuratorReducer(
      initialConfiguratorState,
      select("blomster-1", "supplier-vietri")
    );
    expect(state.designSlug).toBe("blomster-1");
    expect(state.supplierId).toBe("supplier-vietri");
  });

  it("selecting a different design replaces slug AND supplier", () => {
    const first = configuratorReducer(
      initialConfiguratorState,
      select("blomster-1", "supplier-a")
    );
    const second = configuratorReducer(first, select("krabbe", "supplier-b"));
    expect(second.designSlug).toBe("krabbe");
    expect(second.supplierId).toBe("supplier-b");
  });

  it("re-selecting the same design is a no-op (same reference)", () => {
    const first = configuratorReducer(
      initialConfiguratorState,
      select("juletre", "supplier-a")
    );
    const again = configuratorReducer(first, select("juletre", "supplier-a"));
    expect(again).toBe(first);
  });
});
