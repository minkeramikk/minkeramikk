/**
 * Configurator state (F01: step 1 only — F02/F03 will extend this).
 * Pure reducer: trivially unit-testable, no React imports.
 *
 * Selecting a design locks the supplier for the item (ADR 0007):
 * `supplierId` is the filter F02 (options) and F03 (ceramics) build on.
 */

export interface ConfiguratorState {
  designSlug: string | null;
  supplierId: string | null;
}

export const initialConfiguratorState: ConfiguratorState = {
  designSlug: null,
  supplierId: null,
};

export type ConfiguratorAction = {
  type: "selectDesign";
  design: { slug: string; supplierId: string };
};

export function configuratorReducer(
  state: ConfiguratorState,
  action: ConfiguratorAction
): ConfiguratorState {
  switch (action.type) {
    case "selectDesign": {
      // re-selecting the same design is a no-op (keeps referential equality)
      if (state.designSlug === action.design.slug) return state;
      return {
        ...state,
        designSlug: action.design.slug,
        supplierId: action.design.supplierId,
      };
    }
    default:
      return state;
  }
}
