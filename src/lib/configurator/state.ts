/**
 * Configurator state (F01 step 1 + F02 step 2 — F03 will extend further).
 * Pure reducer: trivially unit-testable, no React imports.
 *
 * Selecting a design locks the supplier for the item (ADR 0007): `supplierId`
 * is the filter F02 (options) and F03 (ceramics) build on. Step 2 tracks the
 * selected option per category and an optional color lock.
 */

export interface ConfiguratorState {
  designSlug: string | null;
  supplierId: string | null;
  /** categorySlug → optionId */
  selections: Record<string, string>;
  /** "Lås farger": sync color choices across categories sharing a sync_group. */
  colorLock: boolean;
}

export const initialConfiguratorState: ConfiguratorState = {
  designSlug: null,
  supplierId: null,
  selections: {},
  colorLock: false,
};

/** Minimal shape the reducer needs to apply color-lock sync (ADR 0004). */
export interface SyncCategory {
  slug: string;
  syncGroup: string | null;
  /** optionId → hex, for hex-matching across the group (legacy behaviour). */
  optionHex: Record<string, string | null>;
  /** hex → optionId, to find the matching option in a sibling category. */
  hexToOption: Record<string, string>;
}

export type ConfiguratorAction =
  | { type: "selectDesign"; design: { slug: string; supplierId: string } }
  | {
      type: "selectOption";
      categorySlug: string;
      optionId: string;
      /** present → enables color-lock sync across the same sync_group */
      categories?: SyncCategory[];
    }
  | { type: "setColorLock"; locked: boolean }
  | { type: "hydrate"; state: ConfiguratorState };

export function configuratorReducer(
  state: ConfiguratorState,
  action: ConfiguratorAction
): ConfiguratorState {
  switch (action.type) {
    case "selectDesign": {
      if (state.designSlug === action.design.slug) return state;
      // a new design resets step-2 selections (different categories)
      return {
        ...state,
        designSlug: action.design.slug,
        supplierId: action.design.supplierId,
        selections: {},
      };
    }

    case "selectOption": {
      const selections = {
        ...state.selections,
        [action.categorySlug]: action.optionId,
      };

      if (state.colorLock && action.categories) {
        const source = action.categories.find(
          (c) => c.slug === action.categorySlug
        );
        const hex = source?.optionHex[action.optionId] ?? null;
        if (source?.syncGroup && hex) {
          for (const cat of action.categories) {
            if (cat.slug === action.categorySlug) continue;
            if (cat.syncGroup !== source.syncGroup) continue;
            const match = cat.hexToOption[hex];
            if (match) selections[cat.slug] = match;
          }
        }
      }

      return { ...state, selections };
    }

    case "setColorLock":
      return { ...state, colorLock: action.locked };

    case "hydrate":
      return action.state;

    default:
      return state;
  }
}
