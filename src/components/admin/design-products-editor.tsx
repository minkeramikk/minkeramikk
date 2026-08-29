"use client";

import { saveDesignProducts } from "@/app/admin/designs/actions";
import {
  ProductMultiSelect,
  type EditorProduct,
} from "@/components/admin/product-multi-select";

export type { EditorProduct };

/**
 * F34 design→product whitelist, now a thin wrapper over the generalised
 * `ProductMultiSelect` (R4-SCONTI Task 7). Every testid, class and copy string
 * below is unchanged from the original standalone component on purpose — this
 * page has no e2e coverage of its own today, but the DOM must still stay
 * byte-identical so it never becomes the reason a future spec breaks.
 */
export function DesignProductsEditor({
  designId,
  products,
  initialSelectedIds,
}: {
  designId: string;
  products: EditorProduct[];
  initialSelectedIds: string[];
}) {
  return (
    <ProductMultiSelect
      action={saveDesignProducts}
      extraFields={{ designId }}
      products={products}
      initialSelectedIds={initialSelectedIds}
      formTestId="design-products-form"
      testIdPrefix="dp"
      labels={{
        intro:
          "Choose which ceramics this design can be produced on. Step 3 of the configurator shows only these.",
        allTitle: "All ceramics from this supplier",
        allDesc:
          "Default. New ceramics added to the supplier are included automatically.",
        someTitle: "Only selected ceramics",
        someDesc:
          "Pick one or more. New supplier ceramics stay excluded until you tick them.",
        searchPlaceholder: "Search ceramics…",
        counterSuffix: "ceramics will be visible at step 3",
        emptyHint:
          "Select at least one ceramic — or switch back to “All ceramics”. A design can’t have an empty step 3.",
        saveLabel: "Save available ceramics",
        savingLabel: "Saving…",
        footnote:
          "Hidden ceramics (visible = off) never appear in the configurator, even if ticked here.",
      }}
    />
  );
}
